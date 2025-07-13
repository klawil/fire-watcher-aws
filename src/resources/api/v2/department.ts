import {
  CostExplorerClient, GetCostAndUsageCommand
} from '@aws-sdk/client-cost-explorer';
import {
  GetObjectCommand, PutObjectCommand, S3Client
} from '@aws-sdk/client-s3';
import twilio from 'twilio';

import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';
import {
  validateRequest
} from './_utils';

import { getTwilioSecret } from '@/deprecated/utils/general';
import {
  api401Body, api403Body, generateApi400Body
} from '@/types/api/_shared';
import {
  BillingItem,
  GetDepartmentApi, getDepartmentApiParamsValidator, getDepartmentApiQueryValidator
} from '@/types/api/departments';
import { TwilioAccounts } from '@/types/backend/department';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('resources/api/v2/department');
const s3 = new S3Client();
const costExporer = new CostExplorerClient();

const twilioCategoryLabels: { [key: string]: string } = {
  phonenumbers: 'Phone Numbers',
  'sms-outbound': 'Outbound SMS',
  'mms-outbound': 'Outbound MMS',
  'sms-inbound': 'Inbound SMS',
  'mms-inbound': 'Inbound MMS',
  'sms-messages-carrierfees': 'SMS Carrier Fees',
  'mms-messages-carrierfees': 'MMS Carrier Fees',
};

const awsServiceUnits: { [key: string]: string } = {
  'Amazon API Gateway': 'requests',
  'Amazon Transcribe': 'seconds',
};

function dateToString(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString()
    .padStart(2, '0')}`;
}

async function getAwsBillingData(
  start: Date,
  end: Date,
  department: TwilioAccounts | null
): Promise<BillingItem[]> {
  const startDate = dateToString(start);
  const endDate = dateToString(end);
  const fileName = `${startDate}-${department !== null ? department : 'all'}.json`;

  // Check for cached data
  try {
    const data = await s3.send(new GetObjectCommand({
      Bucket: process.env.COSTS_BUCKET,
      Key: fileName,
    }));
    if (typeof data.Body !== 'undefined') {
      const body = JSON.parse(data.Body.toString());
      return body.data;
    }
  } catch (e) {
    if (
      typeof e === 'object' &&
      e !== null &&
      'code' in e &&
      e.code !== 'NoSuchKey'
    ) {
      logger.error(`Error getting ${startDate} info (${fileName})`, e);
      throw e;
    }
  }

  // Fetch the actual data
  const awsData = await costExporer.send(new GetCostAndUsageCommand({
    Granularity: 'MONTHLY',
    Metrics: [
      'UnblendedCost',
      'UsageQuantity',
    ],
    TimePeriod: {
      Start: startDate,
      End: endDate,
    },
    GroupBy: [ {
      Type: 'DIMENSION',
      Key: 'SERVICE',
    }, ],
    ...department !== null
      ? {
        Filter: {
          CostCategories: {
            Key: 'Department',
            Values: [ department, ],
          },
        },
      }
      : {},
  }));

  const cache: {
    dateTimePulled: string;
    data: BillingItem[];
  } = {
    dateTimePulled: new Date().toISOString(),
    data: [],
  };
  if (
    awsData.ResultsByTime &&
    awsData.ResultsByTime.length > 0 &&
    awsData.ResultsByTime[0].Groups
  ) {
    cache.data = awsData.ResultsByTime[0].Groups
      .map(group => {
        const cat = group.Keys?.join('|') || 'Unkown';

        return {
          type: 'aws',
          cat: cat,
          price: Number(group.Metrics?.UnblendedCost?.Amount || 0),
          usage: Number(group.Metrics?.UsageQuantity?.Amount || 0),
          usageUnit: typeof awsServiceUnits[cat] !== 'undefined'
            ? awsServiceUnits[cat]
            : group.Metrics?.UsageQuantity?.Unit || 'Unknown',
        };
      });
  }

  await s3.send(new PutObjectCommand({
    Bucket: process.env.COSTS_BUCKET,
    Key: fileName,
    Body: JSON.stringify(cache),
  }));

  return cache.data;
}

const GET: LambdaApiFunction<GetDepartmentApi> = async function (
  event,
  user,
  userPerms
) {
  logger.trace('GET', ...arguments);

  // Authorize the user
  if (user === null) {
    return [
      401,
      api401Body,
    ];
  }
  if (!userPerms.isAdmin && !userPerms.isDistrictAdmin) {
    return [
      403,
      api403Body,
    ];
  }

  // Validate the query and path parameters
  const {
    params,
    query,
    validationErrors,
  } = validateRequest<GetDepartmentApi>({
    paramsRaw: event.pathParameters,
    paramsValidator: getDepartmentApiParamsValidator,
    queryRaw: event.queryStringParameters || {},
    queryValidator: getDepartmentApiQueryValidator,
  });
  if (
    params === null ||
    query === null ||
    validationErrors.length > 0
  ) {
    return [
      400,
      generateApi400Body(validationErrors),
    ];
  }

  // Make sure the user can access this department
  if (
    !userPerms.isDistrictAdmin &&
    (params.id !== 'all' && !userPerms.adminDepartments.includes(params.id))
  ) {
    return [
      403,
      api403Body,
    ];
  }

  // Get the timeframe that we should use
  const month = query.month || 'last';
  let endDate = new Date();
  endDate.setUTCMilliseconds(0);
  endDate.setUTCSeconds(0);
  endDate.setUTCMinutes(0);
  endDate.setUTCHours(0);
  endDate.setDate(1);
  let startDate = new Date(endDate.getTime() - (24 * 60 * 60 * 1000));
  startDate.setDate(1);
  if (month === 'this') {
    startDate = new Date();
    startDate.setDate(1);
    endDate.setDate(28);
    endDate = new Date(endDate.getTime() + (7 * 24 * 60 * 60 * 1000));
    endDate.setDate(1);
  }
  endDate = new Date(endDate.getTime() - 1000);

  // Get the AWS information only for last month (cost $0.01 / request!)
  let awsDataPromise: Promise<BillingItem[]> = new Promise(res => res([]));
  if (month !== 'this') {
    awsDataPromise = getAwsBillingData(startDate, endDate, params.id === 'all' ? null : params.id);
  }

  // Get the Twilio auth information
  const twilioAccount: TwilioAccounts = params.id === 'all'
    ? ''
    : params.id;
  const twilioSecret = await getTwilioSecret();
  const accountSid = twilioSecret[`accountSid${twilioAccount}`];
  const authToken = twilioSecret[`authToken${twilioAccount}`];
  if (
    typeof accountSid === 'undefined' ||
    typeof authToken === 'undefined'
  ) {
    throw new Error(`Unable to find auth for account ${params.id} - ${twilioAccount}`);
  }

  // Get the twilio cost information
  const twilioData: BillingItem[] = await new Promise((res, rej) => {
    twilio(accountSid, authToken).api.v2010.account.usage.records
      .list({
        limit: 1000,
        includeSubaccounts: true,
        startDate: startDate,
        endDate: endDate,
      }, (err, items) => err
        ? rej(err)
        : res(items
          .filter(item => typeof twilioCategoryLabels[item.category] !== 'undefined')
          .map(item => ({
            type: 'twilio',
            cat: twilioCategoryLabels[item.category] || item.category,
            price: Number(item.price),
            usage: Number(item.usage),
            usageUnit: item.usageUnit,
          }))));
  });

  // Await the AWS data
  const awsData = await awsDataPromise;

  return [
    200,
    {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      items: [
        ...twilioData,
        ...awsData,
      ],
    },
  ];
};

export const main = handleResourceApi.bind(null, {
  GET,
});
