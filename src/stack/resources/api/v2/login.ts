import * as AWS from 'aws-sdk';
import { getLogger } from '../../../../logic/logger';
import { checkObject, getCurrentUser, getFrontendUserObj, getSetCookieHeader, handleResourceApi, LambdaApiFunction, parseJsonBody } from './_base';
import { GetLoginCodeApi, loginApiCodeBodyValidator, loginApiParamsValidator, SubmitLoginCodeApi } from '@/types/api/login';
import { api200Body, generateApi400Body } from '@/types/api/_shared';
import { FullUserObject } from '@/types/api/users';
import { LoginBody } from '../../types/queue';
import { getUserPermissions } from '../../../utils/user';
import { randomString } from '@/logic/strings';
import { TABLE_USER, typedGet, typedUpdate } from '@/stack/utils/dynamoTyped';

const loginDuration = 60 * 60 * 24 * 31; // Logins last 31 days

const logger = getLogger('login');
const sqs = new AWS.SQS();
const queueUrl = process.env.QUEUE_URL as string;

const GET: LambdaApiFunction<GetLoginCodeApi> = async function (event) {
  logger.trace('GET', ...arguments);

  // Validate the path parameters
  const [ params, paramsErrors ] = checkObject<GetLoginCodeApi['params']>(
    event.pathParameters,
    loginApiParamsValidator,
  );
  if (
    params === null ||
    paramsErrors.length > 0
  ) return [ 400, generateApi400Body(paramsErrors) ];

  // Make sure the user is not already logged in
  const [ user ] = await getCurrentUser(event);
  if (user !== null) {
    return [
      400,
      generateApi400Body([ 'user' ]),
    ];
  }

  // Make sure the user is actually valid
  const userObj = await typedGet<FullUserObject>({
    TableName: TABLE_USER,
    Key: {
      phone: params.id,
    },
  });
  if (!userObj.Item) {
    return [
      200,
      api200Body,
    ];
  }
  const userPerms = getUserPermissions(userObj.Item);
  if (!userPerms.isUser) {
    return [
      200,
      api200Body,
    ];
  }

  // Trigger the text to be sent to the user
  const queueMessage: LoginBody = {
    action: 'login',
    phone: params.id.toString(),
  };
  await sqs.sendMessage({
    MessageBody: JSON.stringify(queueMessage),
    QueueUrl: queueUrl,
  }).promise();

  return [
    200,
    api200Body,
  ];
}

const POST: LambdaApiFunction<SubmitLoginCodeApi> = async function (event) {
  logger.trace('POST', ...arguments);

  // Validate the path parameters
  const [ params, paramsErrors ] = checkObject<GetLoginCodeApi['params']>(
    event.pathParameters,
    loginApiParamsValidator,
  );
  if (
    params === null ||
    paramsErrors.length > 0
  ) return [ 400, generateApi400Body(paramsErrors) ];

  // Validate the body
  const [ body, bodyErrors ] = parseJsonBody<SubmitLoginCodeApi['body']>(
    event.body,
    loginApiCodeBodyValidator,
  );
  if (
    body === null ||
    bodyErrors.length > 0
  )
    return [
      400,
      generateApi400Body(bodyErrors),
    ];

  // Make sure the user is not already logged in
  const [ user ] = await getCurrentUser(event);
  if (user !== null) {
    return [
      400,
      generateApi400Body([]),
    ];
  }

  // Make sure the user is actually valid
  const userObjGet = await typedGet<FullUserObject>({
    TableName: TABLE_USER,
    Key: {
      phone: params.id,
    },
  });
  if (!userObjGet.Item) {
    return [
      400,
      generateApi400Body([ 'code' ]),
    ];
  }
  const userPerms = getUserPermissions(userObjGet.Item);
  if (!userPerms.isUser) {
    return [
      400,
      generateApi400Body([ 'code' ]),
    ];
  }

  // Check that the code is not expired
  const userObj = userObjGet.Item;
  logger.error('Possible fail', userObj, Date.now(), body);
  if (
    !userObj.code ||
    !userObj.codeExpiry ||
    Date.now() > userObj.codeExpiry ||
    body.code !== userObj.code
  ) return [
    400,
    generateApi400Body([ 'code' ]),
  ];

  // Generate the authentication token for the user
  const nowTime = Date.now();
  const token = randomString(32);
  const tokenExpiry = nowTime + (loginDuration * 1000);
  const userTokens: FullUserObject['loginTokens'] = [
    ...(userObj.loginTokens || []).filter(token => (token.tokenExpiry || 0) > nowTime),
    {
      token,
      tokenExpiry,
    },
  ];
  await typedUpdate<FullUserObject>({
    TableName: TABLE_USER,
    Key: {
      phone: params.id,
    },
    ExpressionAttributeNames: {
      '#loginTokens': 'loginTokens',
      '#code': 'code',
      '#codeExpiry': 'codeExpiry',
    },
    ExpressionAttributeValues: {
      ':loginTokens': userTokens,
    },
    UpdateExpression: 'REMOVE #code, #codeExpiry SET #loginTokens = :loginTokens',
  });

  return [
    200,
    getFrontendUserObj(userObj),
    {
      'Set-Cookie': [
        getSetCookieHeader('cofrn-user', params.id.toString(), loginDuration),
        getSetCookieHeader('cofrn-token', token, loginDuration),
      ],
    },
  ];
}

export const main = handleResourceApi.bind(null, {
  GET,
  POST,
});
