import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';
import {
  parseJsonBody
} from './_utils';

import {
  api401Body, api403Body, api500Body, generateApi400Body
} from '@/types/api/_shared';
import {
  AddErrorApi,
  ErrorTableItem, GetErrorsApi, errorItemValidator
} from '@/types/api/errors';
import {
  TABLE_ERROR, typedPutItem,
  typedScan
} from '@/utils/backend/dynamoTyped';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('resources/api/v2/errors');

const GET: LambdaApiFunction<GetErrorsApi> = async function (event, user, userPerms) {
  logger.trace('GET', ...arguments);

  // Authorize the user
  if (user === null) {
    return [
      401,
      api401Body,
    ];
  }
  if (!userPerms.isDistrictAdmin) {
    return [
      403,
      api403Body,
    ];
  }

  // Retrieve the errors
  const errors = await typedScan<ErrorTableItem>({
    TableName: TABLE_ERROR,
    Limit: 100,
  });

  return [
    200,
    {
      errors: errors.Items || [],
    },
  ];
};

const POST: LambdaApiFunction<AddErrorApi> = async function (event, user) {
  logger.trace('POST', ...arguments);
  const eventTime = Date.now();

  // Validate the body
  const [
    body,
    bodyErrors,
  ] = parseJsonBody(
    event.body,
    errorItemValidator
  );
  if (
    body === null ||
    bodyErrors.length > 0
  ) {
    return [
      400,
      generateApi400Body(bodyErrors),
    ];
  }

  // Log the event
  logger.error('Reported error', body);

  // Add to the table
  await typedPutItem<ErrorTableItem>({
    TableName: TABLE_ERROR,
    Item: {
      Datetime: eventTime,
      Url: body.url,
      Message: body.message,
      Trace: body.trace,
      UserAgent: event.headers['user-agent'] || 'N/A',
      User: user === null ? 'N/A' : user.phone.toString(),
    },
  });

  return [
    500,
    api500Body,
  ];
};

export const main = handleResourceApi.bind(null, {
  POST,
  GET,
});
