import {
  SQSClient,
  SendMessageCommand
} from '@aws-sdk/client-sqs';

import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';
import { validateTwilioRequest } from './_twilio';

import {
  getTwilioSecret, twilioPhoneNumbers
} from '@/deprecated/utils/general';
import {
  CreateTextApi, createTextBodyValidator, createTextQueryValidator
} from '@/types/api/twilio';
import { FullUserObject } from '@/types/api/users';
import { departmentConfig } from '@/types/backend/department';
import { TypedUpdateInput } from '@/types/backend/dynamo';
import { TwilioTextQueueItem } from '@/types/backend/queue';
import {
  TABLE_USER, typedGet, typedUpdate
} from '@/utils/backend/dynamoTyped';
import { validateObject } from '@/utils/backend/validation';
import { getLogger } from '@/utils/common/logger';
import { getUserPermissions } from '@/utils/common/user';

const logger = getLogger('twilioBase');

const sqs = new SQSClient();
const queueUrl = process.env.SQS_QUEUE;

function buildTwilioResponse(
  statusCode: keyof CreateTextApi['responses'],
  message?: string
): [ keyof CreateTextApi['responses'], string, null, string ] {
  const msgString = message
    ? `<Message>${message}</Message>`
    : '';
  return [
    statusCode,
    `<Response>${msgString}</Response>`,
    null,
    'application/xml',
  ];
}

interface TextCommand {
  response: string;
  update: Pick<
    TypedUpdateInput<FullUserObject>,
    'ExpressionAttributeNames' | 'ExpressionAttributeValues' | 'UpdateExpression'
  >;
}

const textCommands: {
  [key: string]: TextCommand;
} = {
  '!startTest': {
    response: 'Testing mode enabled',
    update: {
      ExpressionAttributeNames: {
        '#isTest': 'isTest',
      },
      ExpressionAttributeValues: {
        ':isTest': true,
      },
      UpdateExpression: 'SET #isTest = :isTest',
    },
  },
  '!endTest': {
    response: 'Testing mode disabled',
    update: {
      ExpressionAttributeNames: {
        '#isTest': 'isTest',
      },
      UpdateExpression: 'REMOVE #isTest',
    },
  },
};

const POST: LambdaApiFunction<CreateTextApi> = async function (event) {
  logger.trace('POST');

  // Get and validate the body
  const urlParamsBody = new URLSearchParams(event.body || '');
  const bodyObj: {
    [key: string]: unknown;
  } = {};
  for (const [
    key,
    value,
  ] of urlParamsBody.entries()) {
    bodyObj[key] = value;
  }
  const [
    body,
    bodyErrors,
  ] = validateObject<CreateTextApi['body']>(
    bodyObj,
    createTextBodyValidator
  );
  if (
    body === null ||
    bodyErrors.length > 0
  ) {
    logger.error('Invalid Request - body', bodyErrors, bodyObj);
    return buildTwilioResponse(400, 'There was an issue processing your request');
  }

  // Get and validate the query params
  const [
    query,
    queryErrors,
  ] = validateObject(
    event.queryStringParameters || {},
    createTextQueryValidator
  );
  if (
    query === null ||
    queryErrors.length > 0
  ) {
    logger.error('Invalid Request - query', queryErrors, event.queryStringParameters);
    return buildTwilioResponse(400, 'There was an issue processing your request');
  }

  // Get the phone number configurations
  const phoneNumberConfigs = await twilioPhoneNumbers();
  const twilioConf = await getTwilioSecret();
  if (typeof phoneNumberConfigs[body.To] === 'undefined') {
    logger.error(`Invalid phone number - ${body.To}`, body);
    return buildTwilioResponse(200);
  }
  const phoneNumberConf = phoneNumberConfigs[body.To];
  if (typeof twilioConf[`authToken${phoneNumberConf.account || ''}`] === 'undefined') {
    logger.error(`Invalid phone number account - ${phoneNumberConf.account || 'undef'}`, body, phoneNumberConf);
    return buildTwilioResponse(200);
  }

  // Validate the signature
  const [
    isValid,
    isTest,
  ] = validateTwilioRequest(
    event,
    query,
    bodyObj,
    phoneNumberConf,
    twilioConf
  );
  if (!isValid) {
    return buildTwilioResponse(200);
  }

  // Check for a user
  const sender = await typedGet<FullUserObject>({
    TableName: TABLE_USER,
    Key: {
      phone: Number(body.From.slice(2)),
    },
  });
  if (!sender.Item) {
    return buildTwilioResponse(200);
  }
  if (
    phoneNumberConf.type === 'page' &&
    typeof phoneNumberConf.department !== 'undefined' &&
    !getUserPermissions(sender.Item).adminDepartments.includes(phoneNumberConf.department) &&
    departmentConfig[phoneNumberConf.department].type === 'page'
  ) {
    return buildTwilioResponse(200, 'This department is not using the group text feature of this system');
  }

  // Validate that the user can send a message to this number
  const sendingUser = sender.Item;
  if (
    typeof phoneNumberConf.department === 'undefined' ||
    phoneNumberConf.type === 'alert'
  ) {
    return buildTwilioResponse(
      200,
      'This number is not able to receive messages'
    );
  }
  if (!sendingUser[phoneNumberConf.department]?.active) {
    return buildTwilioResponse(
      200,
      `You are not an active member of the ${phoneNumberConf.department} department`
    );
  }

  // Check for messages that are text commands
  const isTextCommand = typeof textCommands[body.Body] !== 'undefined';
  if (isTextCommand) {
    await typedUpdate<FullUserObject>({
      TableName: TABLE_USER,
      Key: {
        phone: sendingUser.phone,
      },
      ...textCommands[body.Body].update,
    });
    return buildTwilioResponse(
      200,
      textCommands[body.Body].response
    );
  } else if (body.Body.startsWith('!')) {
    return buildTwilioResponse(
      200,
      'Messages that begin with an exclamation mark are reserved for testing purposes'
    );
  }

  // Send the message into the queue
  const queueMessage: TwilioTextQueueItem = {
    action: 'twilio-text',
    body,
    user: {
      ...sendingUser,
      isTest: sendingUser.isTest || isTest,
    },
  };
  await sqs.send(new SendMessageCommand({
    MessageBody: JSON.stringify(queueMessage),
    QueueUrl: queueUrl,
  }));

  return buildTwilioResponse(200);
};

export const main = handleResourceApi.bind(null, {
  POST,
});
