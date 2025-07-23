import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';
import { validateRequest } from './_utils';

import {
  api401Body, api403Body, generateApi400Body
} from '@/types/api/_shared';
import {
  PatchRadioApi,
  RadioObject, patchRadioApiBodyValidator, patchRadioApiParamsValidator
} from '@/types/api/radios';
import {
  TABLE_RADIOS, typedDeleteItem, typedUpdate
} from '@/utils/backend/dynamoTyped';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('resources/api/v2/radio');

const PATCH: LambdaApiFunction<PatchRadioApi> = async function (event, user, userPerms) {
  logger.trace('PATCH', ...arguments);

  // Validate the request
  const {
    params,
    body,
    validationErrors,
  } = validateRequest<PatchRadioApi>({
    paramsRaw: event.pathParameters,
    paramsValidator: patchRadioApiParamsValidator,
    bodyRaw: event.body,
    bodyParser: 'json',
    bodyValidator: patchRadioApiBodyValidator,
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

  // Authorize the user
  if (user === null) {
    return [
      401,
      api401Body,
    ];
  }
  if (!userPerms.canEditNames) {
    return [
      403,
      api403Body,
    ];
  }

  // Update the radio ID
  if (body.name === null) {
    await typedDeleteItem<RadioObject>({
      TableName: TABLE_RADIOS,
      Key: {
        RadioID: params.id,
      },
    });
  } else {
    await typedUpdate<RadioObject>({
      TableName: TABLE_RADIOS,
      Key: {
        RadioID: params.id,
      },
      ExpressionAttributeNames: {
        '#Name': 'Name',
      },
      ExpressionAttributeValues: {
        ':Name': body.name,
      },
      UpdateExpression: 'SET #Name = :Name',
    });
  }

  return [
    200,
    {
      RadioID: params.id,
      Name: body.name || '',
    },
  ];
};

export const main = handleResourceApi.bind(null, {
  PATCH,
});
