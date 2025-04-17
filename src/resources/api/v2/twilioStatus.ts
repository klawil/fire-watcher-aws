import * as AWS from 'aws-sdk';

import {
  LambdaApiFunction,
  handleResourceApi, validateRequest
} from './_base';
import { validateTwilioRequest } from './_twilio';

import {
  getTwilioSecret, twilioPhoneNumbers
} from '@/deprecated/utils/general';
import { generateApi400Body } from '@/types/api/_shared';
import {
  UpdateTextStatusApi,
  createTextQueryValidator, updateTextStatusBodyValidator, updateTextStatusParamsValidator
} from '@/types/api/twilio';
import {
  FullUserObject, validDepartments
} from '@/types/api/users';
import { PhoneNumberIssueQueueItem } from '@/types/backend/queue';
import { TwilioQueueEvent } from '@/types/backend/twilioQueue';
import {
  TABLE_USER, typedGet, typedUpdate
} from '@/utils/backend/dynamoTyped';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('twilioStatus');
const sqs = new AWS.SQS();
const cloudWatch = new AWS.CloudWatch();
const queueUrl = process.env.SQS_QUEUE;
const twilioQueueUrl = process.env.TWILIO_QUEUE;

const POST: LambdaApiFunction<UpdateTextStatusApi> = async function (event) {
  logger.trace('GET', ...arguments);
  const eventTime = Date.now();

  // Parse the body
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

  // Validate the request
  const {
    params,
    query,
    body,
    validationErrors,
  } = validateRequest<UpdateTextStatusApi>({
    paramsRaw: event.pathParameters,
    paramsValidator: updateTextStatusParamsValidator,
    bodyRaw: bodyObj,
    bodyValidator: updateTextStatusBodyValidator,
    queryRaw: event.queryStringParameters || {},
    queryValidator: createTextQueryValidator,
  });
  if (
    params === null ||
    query === null ||
    body === null ||
    validationErrors.length > 0
  ) return [
    400,
    generateApi400Body(validationErrors),
  ];

  // Get the information about the phone number
  const phoneNumberConfigs = await twilioPhoneNumbers();
  const twilioConf = await getTwilioSecret();
  if (typeof phoneNumberConfigs[body.From] === 'undefined') {
    logger.error(`Invalid phone number - ${body.From}`, body);
    return [
      400,
      generateApi400Body([ 'From', ]),
    ];
  }
  const phoneNumberConf = phoneNumberConfigs[body.From];
  if (typeof twilioConf[`authToken${phoneNumberConf.account || ''}`] === 'undefined') {
    logger.error(`Invalid phone number account - ${phoneNumberConf.account || 'undef'}`, body, phoneNumberConf);
    return [
      400,
      generateApi400Body([ 'From', ]),
    ];
  }

  // Validate the Twilio signature
  const [ isValid, ] = validateTwilioRequest(
    event,
    query,
    bodyObj,
    phoneNumberConf,
    twilioConf
  );
  if (!isValid) {
    return [
      400,
      generateApi400Body([]),
    ];
  }

  // Validate the user sent to
  const userGet = await typedGet<FullUserObject>({
    TableName: TABLE_USER,
    Key: {
      phone: Number(body.To.slice(2)),
    },
  });
  if (!userGet.Item) {
    logger.error(`Invalid user ID - user ${body.To}`, userGet);
    return [
      204,
      '',
    ];
  }
  const user = userGet.Item;

  const promises: {
    [key: string]: Promise<unknown>;
  } = {};

  // Update the message table
  const twilioQueueBody: TwilioQueueEvent = {
    datetime: params.id,
    status: body.MessageStatus,
    phone: user.phone,
    eventTime,
  };
  promises['text-update'] = sqs.sendMessage({
    QueueUrl: twilioQueueUrl,
    MessageBody: JSON.stringify(twilioQueueBody),
  }).promise();

  // Update the user for delivered and undelivered messages
  if ([
    'undelivered',
    'delivered',
  ].includes(body.MessageStatus)) {
    const updateValues: AWS.DynamoDB.DocumentClient.ExpressionAttributeValueMap = {
      ':lastStatus': body.MessageStatus,
      ':lastStatusBase': 0,
    };
    let updateExpr: string;
    if (body.MessageStatus === 'delivered') {
      updateExpr = '#lastStatusCount = :lastStatusBase';
    } else {
      updateValues[':lastStatusIncrement'] = 1;
      updateExpr = '#lastStatusCount = if_not_exists(#lastStatusCount, :lastStatusBase) + :lastStatusIncrement';
    }

    promises['user-update'] = typedUpdate<FullUserObject>({
      TableName: TABLE_USER,
      Key: {
        phone: user.phone,
      },
      ExpressionAttributeNames: {
        '#lastStatus': 'lastStatus',
        '#lastStatusCount': 'lastStatusCount',
      },
      ExpressionAttributeValues: updateValues,
      UpdateExpression: `SET #lastStatus = :lastStatus, ${updateExpr}`,
      ReturnValues: 'ALL_NEW',
    })
      .then(result => {
        // Check for enough undelivered messages to alert the admins of the department
        if (result === null) return null;

        if (
          result.Attributes?.lastStatus === 'undelivered' &&
          typeof result.Attributes?.lastStatusCount === 'number' &&
          result.Attributes.lastStatusCount >= 10 &&
          result.Attributes.lastStatusCount % 10 === 0 &&
          typeof result.Attributes.phone !== 'undefined'
        ) {
          const queueMessage: PhoneNumberIssueQueueItem = {
            action: 'phone-issue',
            count: result.Attributes.lastStatusCount,
            name: `${result.Attributes.fName} ${result.Attributes.lName}`,
            number: result.Attributes.phone,
            department: validDepartments.filter(dep => result.Attributes && result.Attributes[dep]?.active),
          };
          return sqs.sendMessage({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify(queueMessage),
          }).promise();
        }
        return null;
      });
  }

  // Update the metrics for the type of message status
  const metricName = body.MessageStatus.slice(0, 1).toUpperCase() +
    body.MessageStatus.slice(1) + 'Time';
  const messageTime = new Date(params.id);
  promises['metrics'] = cloudWatch.putMetricData({
    Namespace: 'Twilio Health',
    MetricData: [ {
      MetricName: metricName,
      Timestamp: messageTime,
      Unit: 'Milliseconds',
      Value: eventTime - messageTime.getTime(),
    }, ],
  }).promise();

  let wasError = false;
  await Promise.all(Object.keys(promises)
    .map(name => promises[name].catch(e => {
      wasError = true;
      logger.error(`Error on promise ${name}`, e);
    })));
  if (wasError) throw new Error('Error in promises');

  return [
    204,
    '',
  ];
};

export const main = handleResourceApi.bind(null, {
  POST,
});
