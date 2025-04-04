import * as AWS from 'aws-sdk';
import { getLogger } from '../../utils/logger';
import { api401Body, api403Body, api404Body, generateApi400Body } from '$/apiv2/_shared';
import { GetTalkgroupApi, PatchTalkgroupApi, talkgroupBodyValidator, talkgroupParamsValidator } from '$/apiv2/talkgroups';
import { checkObject, getCurrentUser, handleResourceApi, LambdaApiFunction, parseJsonBody, TABLE_TALKGROUP } from './_base';

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
  // Authorize the user
  const [ user, userPerms, userHeaders ] = await getCurrentUser(event);
  if (user === null) return [ 401, api401Body, userHeaders ];
  if (!userPerms.isDistrictAdmin) return [ 403, api403Body, userHeaders ];

  // Validate the path parameters
  const [ params, paramsErrors ] = checkObject<PatchTalkgroupApi['params']>(
    event.pathParameters,
    talkgroupParamsValidator,
  );
  if (
    params === null ||
    paramsErrors.length > 0
  ) return [ 400, generateApi400Body(paramsErrors) ];

  // Validate the body
  const [ body, bodyErrors ] = parseJsonBody<PatchTalkgroupApi['body']>(
    event.body,
    talkgroupBodyValidator,
  );
  if (
    body === null ||
    bodyErrors.length > 0
  ) return [
    400,
    generateApi400Body(bodyErrors),
  ];

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
