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
  GetInvoiceItemsApi,
  getInvoiceItemsApiParamsValidator,
  getInvoiceItemsApiQueryValidator
} from '@/types/api/invoices';
import { TwilioAccounts } from '@/types/backend/department';
import { getTwilioItems } from '@/utils/backend/twilio';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('resources/api/v2/invoices');

const GET: LambdaApiFunction<GetInvoiceItemsApi> = async function (
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
  } = validateRequest<GetInvoiceItemsApi>({
    paramsRaw: event.pathParameters,
    paramsValidator: getInvoiceItemsApiParamsValidator,
    queryRaw: event.queryStringParameters || {},
    queryValidator: getInvoiceItemsApiQueryValidator,
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
    (params.department === 'all' || !userPerms.adminDepartments.includes(params.department))
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
  const twilioAccount: TwilioAccounts = params.department === 'all'
    ? ''
    : params.department;
  const twilioSecret = await getTwilioSecret();
  const accountSid = twilioSecret[`accountSid${twilioAccount}`];
  const authToken = twilioSecret[`authToken${twilioAccount}`];
  if (
    typeof accountSid === 'undefined' ||
    typeof authToken === 'undefined'
  ) {
    throw new Error(`Unable to find auth for account ${params.department} - ${twilioAccount}`);
  }

  // Get the twilio cost information
  const twilioData = await getTwilioItems(
    accountSid,
    authToken,
    startDate,
    endDate,
    query.by || 'all'
  );

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
