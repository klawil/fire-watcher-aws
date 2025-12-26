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

const twilioCategoryLabels: { [key: string]: string } = {
  phonenumbers: 'Phone Numbers',
  'sms-outbound': 'Outbound SMS',
  'mms-outbound': 'Outbound MMS',
  'sms-inbound': 'Inbound SMS',
  'mms-inbound': 'Inbound MMS',
  'sms-messages-carrierfees': 'SMS Carrier Fees',
  'mms-messages-carrierfees': 'MMS Carrier Fees',
};

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
  let endDate = new Date();
  let startDate = new Date();
  if (
    typeof query.month !== 'undefined' ||
    typeof query.startDate === 'undefined' ||
    typeof query.endDate === 'undefined'
  ) {
    const month = query.month || 'last';
    endDate = new Date();
    endDate.setUTCMilliseconds(0);
    endDate.setUTCSeconds(0);
    endDate.setUTCMinutes(0);
    endDate.setUTCHours(0);
    endDate.setDate(1);
    startDate = new Date(endDate.getTime() - (24 * 60 * 60 * 1000));
    startDate.setDate(1);
    if (month === 'this') {
      startDate = new Date();
      startDate.setDate(1);
      endDate.setDate(28);
      endDate = new Date(endDate.getTime() + (7 * 24 * 60 * 60 * 1000));
      endDate.setDate(1);
    }
    endDate = new Date(endDate.getTime() - 1000);
  } else {
    [
      {
        k: 'startDate',
        d: startDate,
      },
      {
        k: 'endDate',
        d: endDate,
      },
    ].forEach(c => {
      c.d.setUTCMilliseconds(0);
      c.d.setUTCSeconds(0);
      c.d.setUTCMinutes(0);
      c.d.setUTCHours(0);

      const val = query[c.k as 'startDate' | 'endDate'];
      if (typeof val === 'undefined') {
        return;
      }

      const parts = val.split('-');
      if (parts === null) {
        return;
      }
      c.d.setUTCFullYear(Number(parts[0]));
      c.d.setUTCMonth(Number(parts[1]) - 1);
      c.d.setUTCDate(Number(parts[2]));
    });

    // Add one day minus 1 second to the endDate to make it cover the full day
    endDate = new Date(endDate.getTime() + (24 * 60 * 60 * 1000) - 1000);
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

  return [
    200,
    {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      items: [ ...twilioData, ],
    },
  ];
};

export const main = handleResourceApi.bind(null, {
  GET,
});
