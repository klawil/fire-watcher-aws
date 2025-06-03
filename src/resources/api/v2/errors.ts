import {
  LambdaApiFunction,
  handleResourceApi, parseJsonBody
} from './_base';

import {
  api200Body, generateApi400Body
} from '@/types/api/_shared';
import {
  AddErrorApi,
  ErrorTableItem, errorItemValidator
} from '@/types/api/errors';
import {
  TABLE_ERROR, typedPutItem
} from '@/utils/backend/dynamoTyped';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('resources/api/v2/errors');

const POST: LambdaApiFunction<AddErrorApi> = async function (event) {
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
    },
  });

  return [
    200,
    api200Body,
  ];
};

export const main = handleResourceApi.bind(null, {
  POST,
});
