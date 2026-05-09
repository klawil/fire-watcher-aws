import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';
import {
  validateRequest
} from './_utils';

import { getTwilioSecret } from '@/deprecated/utils/general';
import {
  api401Body, api403Body, api404Body, generateApi400Body
} from '@/types/api/_shared';
import {
  GetInvoiceItemsApi,
  Invoice,
  getInvoiceItemsApiParamsValidator,
  getInvoiceItemsApiQueryValidator
} from '@/types/api/invoices';
import {
  PhoneNumberAccount,
  validPhoneNumberAccounts
} from '@/types/backend/department';
import { TABLE_INVOICE } from '@/types/backend/environment';
import { typedGet } from '@/utils/backend/dynamoTyped';
import { getTwilioItems } from '@/utils/backend/twilio';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('api/v2/invoiceItems');

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

  // Look up the invoice to determine the department
  const invoiceResult = await typedGet<Invoice>({
    TableName: TABLE_INVOICE(),
    Key: {
      id: params.id,
    },
  });

  if (!invoiceResult.Item) {
    return [
      404,
      api404Body,
    ];
  }

  const invoice = invoiceResult.Item;

  // Make sure the user can access this invoice's department
  if (
    typeof invoice.department !== 'string' ||
    !validPhoneNumberAccounts.includes(invoice.department as PhoneNumberAccount) ||
    (
      !userPerms.isDistrictAdmin &&
      !userPerms.adminDepartments.includes(
        invoice.department as typeof userPerms.adminDepartments[number]
      )
    )
  ) {
    return [
      403,
      api403Body,
    ];
  }

  const department = invoice.department as PhoneNumberAccount;

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
  const twilioSecret = await getTwilioSecret();
  const accountSid = twilioSecret[`accountSid${department}`];
  const authToken = twilioSecret[`authToken${department}`];
  if (
    typeof accountSid === 'undefined' ||
    typeof authToken === 'undefined'
  ) {
    throw new Error(`Unable to find auth for account ${department}`);
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
