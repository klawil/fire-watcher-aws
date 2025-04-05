import * as AWS from 'aws-sdk';
import { getLogger } from '../../../../logic/logger';
import { api401Body, api403Body, api404Body, generateApi400Body } from '@/types/api/_shared';
import { GetTalkgroupApi, PatchTalkgroupApi, talkgroupBodyValidator, talkgroupParamsValidator } from '@/types/api/talkgroups';
import { checkObject, getCurrentUser, handleResourceApi, LambdaApiFunction, TABLE_TALKGROUP, validateRequest } from './_base';

const logger = getLogger('file');
const docClient = new AWS.DynamoDB.DocumentClient({ apiVersion: "2012-08-10" });

const GET: LambdaApiFunction<GetTalkgroupApi> = async function (event) {
  logger.debug('GET', ...arguments);

  // Validate the path parameters
  const [ params, paramsErrors ] = checkObject<GetTalkgroupApi['params']>(
    event.pathParameters,
    talkgroupParamsValidator,
  );
  if (
    params === null ||
    paramsErrors.length > 0
  ) return [ 400, generateApi400Body(paramsErrors) ];

  const talkgroup = await docClient.get({
    TableName: TABLE_TALKGROUP,
    Key: {
      ID: params.id,
    },
  }).promise();

  if (!talkgroup.Item)
    return [ 404, api404Body ];

  return [ 200, talkgroup.Item as GetTalkgroupApi['responses'][200] ];
}

const PATCH: LambdaApiFunction<PatchTalkgroupApi> = async function (event) {
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
  ) return [
    400,
    generateApi400Body(validationErrors),
  ];

  // Authorize the user
  const [ user, userPerms, userHeaders ] = await getCurrentUser(event);
  if (user === null) return [ 401, api401Body, userHeaders ];
  if (!userPerms.isDistrictAdmin) return [ 403, api403Body, userHeaders ];

  // Verify that the talkgroup exists
  const tgObj = await docClient.get({
    TableName: TABLE_TALKGROUP,
    Key: {
      ID: params.id,
    },
  }).promise();
  if (!tgObj.Item)
    return [ 404, api404Body, userHeaders ];

  // Update the talkgroup
  const tgUpdate = await docClient.update({
    TableName: TABLE_TALKGROUP,
    Key: {
      ID: params.id,
    },
    ExpressionAttributeNames: {
      '#name': 'Name',
    },
    ...(body.name !== null
      ? { ExpressionAttributeValues: { ':name': body.name } }
      : {}
    ),
    UpdateExpression: body.name !== null
      ? 'SET #name = :name'
      : 'REMOVE #name',
    ReturnValues: 'ALL_NEW',
  }).promise();

  if (!tgUpdate.Attributes) {
    console.log(JSON.stringify(body), JSON.stringify(tgUpdate));
    throw new Error(`Failed to update talkgroup`);
  }

  return [ 200, tgUpdate.Attributes as PatchTalkgroupApi['responses'][200], userHeaders ];
}

export const main = handleResourceApi.bind(null, {
  GET,
  PATCH,
});
