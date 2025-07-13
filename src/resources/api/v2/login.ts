import {
  GetSecretValueCommand, SecretsManagerClient
} from '@aws-sdk/client-secrets-manager';
import {
  SQSClient,
  SendMessageCommand
} from '@aws-sdk/client-sqs';
import { sign } from 'jsonwebtoken';

import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';
import {
  getFrontendUserObj, getSetCookieHeader, parseJsonBody
} from './_utils';

import {
  api200Body, generateApi400Body
} from '@/types/api/_shared';
import {
  GetLoginCodeApi, SubmitLoginCodeApi, loginApiCodeBodyValidator, loginApiParamsValidator
} from '@/types/api/auth';
import { FullUserObject } from '@/types/api/users';
import { SendUserAuthCodeQueueItem } from '@/types/backend/queue';
import {
  TABLE_USER, typedGet, typedUpdate
} from '@/utils/backend/dynamoTyped';
import { validateObject } from '@/utils/backend/validation';
import { getLogger } from '@/utils/common/logger';
import { getUserPermissions } from '@/utils/common/user';

const loginDuration = 60 * 60 * 24 * 31; // Logins last 31 days

const logger = getLogger('login');
const sqs = new SQSClient();
const secretsManager = new SecretsManagerClient();
const queueUrl = process.env.SQS_QUEUE;
const jwtSecretArn = process.env.JWT_SECRET;

const GET: LambdaApiFunction<GetLoginCodeApi> = async function (event, user) {
  logger.trace('GET', ...arguments);

  // Validate the path parameters
  const [
    params,
    paramsErrors,
  ] = validateObject<GetLoginCodeApi['params']>(
    event.pathParameters,
    loginApiParamsValidator
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

  // Make sure the user is not already logged in
  if (user !== null) {
    return [
      400,
      generateApi400Body([ 'user', ]),
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
    logger.error('GET validation error - 200', params, userObj);
    return [
      200,
      api200Body,
    ];
  }
  const userPerms = getUserPermissions(userObj.Item);
  if (!userPerms.isUser) {
    logger.error('GET validation error - 200', userObj.Item, userPerms);
    return [
      200,
      api200Body,
    ];
  }

  // Trigger the text to be sent to the user
  const queueMessage: SendUserAuthCodeQueueItem = {
    action: 'auth-code',
    phone: params.id,
  };
  await sqs.send(new SendMessageCommand({
    MessageBody: JSON.stringify(queueMessage),
    QueueUrl: queueUrl,
  }));

  return [
    200,
    api200Body,
  ];
};

const POST: LambdaApiFunction<SubmitLoginCodeApi> = async function (event, user) {
  logger.trace('POST', ...arguments);

  // Validate the path parameters
  const [
    params,
    paramsErrors,
  ] = validateObject<GetLoginCodeApi['params']>(
    event.pathParameters,
    loginApiParamsValidator
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

  // Validate the body
  const [
    body,
    bodyErrors,
  ] = parseJsonBody<SubmitLoginCodeApi['body']>(
    event.body,
    loginApiCodeBodyValidator
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

  // Make sure the user is not already logged in
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
      generateApi400Body([ 'code', ]),
    ];
  }
  const userPerms = getUserPermissions(userObjGet.Item);
  if (!userPerms.isUser) {
    return [
      400,
      generateApi400Body([ 'code', ]),
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
  ) {
    return [
      400,
      generateApi400Body([ 'code', ]),
    ];
  }

  // Generate the authentication token for the user
  const jwtSecret = await secretsManager.send(new GetSecretValueCommand({
    SecretId: jwtSecretArn,
  }))
    .then(data => data.SecretString);
  if (typeof jwtSecret === 'undefined') {
    throw new Error('Unable to get JWT secret');
  }
  const token = sign({ phone: userObj.phone, }, jwtSecret, {
    expiresIn: `${loginDuration}s`,
  });
  await typedUpdate<FullUserObject>({
    TableName: TABLE_USER,
    Key: {
      phone: params.id,
    },
    ExpressionAttributeNames: {
      '#code': 'code',
      '#codeExpiry': 'codeExpiry',
    },
    UpdateExpression: 'REMOVE #code, #codeExpiry',
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
};

export const main = handleResourceApi.bind(null, {
  GET,
  POST,
});
