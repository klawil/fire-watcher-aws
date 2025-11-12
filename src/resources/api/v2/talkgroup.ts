import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';
import {
  validateRequest
} from './_utils';

import {
  api401Body, api403Body, api404Body, generateApi400Body
} from '@/types/api/_shared';
import {
  FullTalkgroupObject, GetTalkgroupApi, PatchTalkgroupApi, talkgroupBodyValidator,
  talkgroupParamsValidator
} from '@/types/api/talkgroups';
import {
  TABLE_TALKGROUP, typedGet, typedUpdate
} from '@/utils/backend/dynamoTyped';
import { validateObject } from '@/utils/backend/validation';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('resources/api/v2/talkgroup');

const GET: LambdaApiFunction<GetTalkgroupApi> = async function (event) {
  logger.debug('GET', ...arguments);

  // Validate the path parameters
  const [
    params,
    paramsErrors,
  ] = validateObject<GetTalkgroupApi['params']>(
    event.pathParameters,
    talkgroupParamsValidator
  );
  if (
    params === null ||
    paramsErrors.length > 0
  ) {
    return [
      400,
      generateApi400Body(paramsErrors),
    ];
  }

  const talkgroup = await typedGet<FullTalkgroupObject>({
    TableName: TABLE_TALKGROUP,
    Key: {
      ID: params.id,
    },
  });

  if (!talkgroup.Item) {
    return [
      404,
      api404Body,
    ];
  }

  return [
    200,
    talkgroup.Item,
  ];
};

const PATCH: LambdaApiFunction<PatchTalkgroupApi> = async function (event, user, userPerms) {
  // Validate the request
  const {
    params,
    body,
    validationErrors,
  } = validateRequest<PatchTalkgroupApi>({
    paramsRaw: event.pathParameters,
    paramsValidator: talkgroupParamsValidator,
    bodyRaw: event.body,
    bodyParser: 'json',
    bodyValidator: talkgroupBodyValidator,
  });
  if (
    params === null ||
    body == null ||
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

  // Verify that the talkgroup exists
  const tgObj = await typedGet<FullTalkgroupObject>({
    TableName: TABLE_TALKGROUP,
    Key: {
      ID: params.id,
    },
  });
  if (!tgObj.Item) {
    return [
      404,
      api404Body,
    ];
  }

  // Update the talkgroup
  const tgUpdate = await typedUpdate({
    TableName: TABLE_TALKGROUP,
    Key: {
      ID: params.id,
    },
    ExpressionAttributeNames: {
      '#name': 'Name',
    },
    ...body.name !== null
      ? { ExpressionAttributeValues: { ':name': body.name, }, }
      : {},
    UpdateExpression: body.name !== null
      ? 'SET #name = :name'
      : 'REMOVE #name',
    ReturnValues: 'ALL_NEW',
  });

  if (!tgUpdate.Attributes) {
    logger.error('Failed to update talkgroup', JSON.stringify(body), JSON.stringify(tgUpdate));
    throw new Error('Failed to update talkgroup');
  }

  return [
    200,
    tgUpdate.Attributes as PatchTalkgroupApi['responses'][200],
  ];
};

export const main = handleResourceApi.bind(null, {
  GET,
  PATCH,
});
