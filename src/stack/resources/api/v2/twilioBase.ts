import * as AWS from 'aws-sdk';
import { CreateTextApi, createTextBodyValidator, createTextQueryValidator } from "@/common/apiv2/twilio";
import { getTwilioSecret, twilioPhoneNumbers } from '../../utils/general';
import { FullUserObject } from '@/common/apiv2/users';
import { TwilioTextQueueItem } from '../../types/queue';
import { validateTwilioRequest } from './_twilio';
import { checkObject, handleResourceApi, LambdaApiFunction, TABLE_USER } from './_base';
import { getLogger } from '../../utils/logger';

const logger = getLogger('twilioBase');
const docClient = new AWS.DynamoDB.DocumentClient();

const sqs = new AWS.SQS();
const queueUrl = process.env.QUEUE_URL as string;

function buildTwilioResponse(
  statusCode: keyof CreateTextApi['responses'],
  message?: string,
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
  update: {
    ExpressionAttributeNames: AWS.DynamoDB.DocumentClient.ExpressionAttributeNameMap;
    ExpressionAttributeValues?: AWS.DynamoDB.DocumentClient.ExpressionAttributeValueMap;
    UpdateExpression: string;
  };
}

const textCommands: {
  [key: string]: TextCommand;
} = {
  startTest: {
    response: 'Testing mode enabled',
    update: {
      ExpressionAttributeNames: {
        '#isTest': 'isTest',
      },
      ExpressionAttributeValues: {
        ':isTest': true,
      },
      UpdateExpression: 'SET #it = :it',
    },
  },
  endTest: {
    response: 'Testing mode disabled',
    update: {
      ExpressionAttributeNames: {
        '#isTest': 'isTest',
      },
      UpdateExpression: 'REMOVE #it',
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
  for (const [key, value] of urlParamsBody.entries()) {
    bodyObj[key] = value;
  }
  const [ body, bodyErrors ] = checkObject(
    bodyObj,
    createTextBodyValidator,
  );
  if (
    body === null ||
    bodyErrors.length > 0
  ) {
    logger.error('Invalid Request - body', bodyErrors, bodyObj);
    return buildTwilioResponse(400, 'There was an issue processing your request');
  }

  // Get and validate the query params
  const [ query, queryErrors ] = checkObject(
    event.queryStringParameters || {},
    createTextQueryValidator,
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
  const [ isValid, isTest ] = validateTwilioRequest(
    event,
    query,
    bodyObj,
    phoneNumberConf,
    twilioConf,
  );
  if (!isValid) {
    return buildTwilioResponse(200);
  }

  // Check for a user
  const sender = await docClient.get({
    TableName: TABLE_USER,
    Key: {
      phone: Number(body.From.slice(2)),
    },
  }).promise();
  if (!sender.Item) {
    return buildTwilioResponse(200);
  }

  // Validate that the user can send a message to this number
  const sendingUser = sender.Item as FullUserObject;
  if (
    typeof phoneNumberConf.department === 'undefined' ||
    phoneNumberConf.type === 'alert'
  ) {
    return buildTwilioResponse(
      200,
      'This number is not able to receive messages',
    );
  }
  if (!sendingUser[phoneNumberConf.department]?.active) {
    return buildTwilioResponse(
      200,
      `You are not an active member of the ${phoneNumberConf.department} department`,
    );
  }

  // Check for messages that are text commands
  const isTextCommand = typeof textCommands[body.Body] !== 'undefined';
  if (isTextCommand) {
    await docClient.update({
      TableName: TABLE_USER,
      Key: {
        phone: sendingUser.phone,
      },
      ...textCommands[body.Body].update,
    }).promise();
    return buildTwilioResponse(
      200,
      textCommands[body.Body].response,
    );
  } else if (body.Body.startsWith('!')) {
    return buildTwilioResponse(
      200,
      'Messages that begin with an exclamation mark are reserved for testing purposes',
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
  await sqs.sendMessage({
    MessageBody: JSON.stringify(queueMessage),
    QueueUrl: queueUrl,
  }).promise();
  
  return buildTwilioResponse(200);
}

export const main = handleResourceApi.bind(null, {
  POST,
});
