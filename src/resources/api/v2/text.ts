import {
  LambdaApiFunction,
  handleResourceApi, validateRequest
} from './_base';

import {
  api200Body, generateApi400Body
} from '@/types/api/_shared';
import {
  FullTextObject, UpdateTextSeenApi, updateTextSeenApiBodyValidator,
  updateTextSeenApiParamsValidator
} from '@/types/api/texts';
import {
  TABLE_TEXT, typedUpdate
} from '@/utils/backend/dynamoTyped';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('text');

const PATCH: LambdaApiFunction<UpdateTextSeenApi> = async function (event) {
  logger.trace('POST', ...arguments);

  // Validate the request
  const {
    params,
    body,
    validationErrors,
  } = validateRequest<UpdateTextSeenApi>({
    paramsRaw: event.pathParameters,
    paramsValidator: updateTextSeenApiParamsValidator,
    bodyRaw: event.body,
    bodyParser: 'json',
    bodyValidator: updateTextSeenApiBodyValidator,
  });
  if (
    params === null ||
    body === null ||
    validationErrors.length > 0
  ) {
    return [
      400,
      generateApi400Body(validationErrors),
    ];
  }

  // Update the message
  try {
    await typedUpdate<FullTextObject>({
      TableName: TABLE_TEXT,
      Key: {
        datetime: params.id,
      },
      ExpressionAttributeNames: {
        '#csLooked': 'csLooked',
        '#csLookedTime': 'csLookedTime',
      },
      ExpressionAttributeValues: {
        ':csLooked': [ body.phone, ],
        ':csLookedTime': [ Date.now(), ],
        ':csLookedPhone': body.phone,
        ':blankList': [],
      },
      ConditionExpression: 'NOT contains(#csLooked, :csLookedPhone)',
      UpdateExpression: 'SET #csLooked = list_append(if_not_exists(#csLooked, :blankList), :csLooked), #csLookedTime = list_append(if_not_exists(#csLookedTime, :blankList), :csLookedTime)',
    });
  } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (
      !('code' in e) ||
      e.code !== 'ConditionalCheckFailedException'
    ) {
      throw e;
    }
  }

  return [
    200,
    api200Body,
  ];
};

export const main = handleResourceApi.bind(null, {
  PATCH,
});
