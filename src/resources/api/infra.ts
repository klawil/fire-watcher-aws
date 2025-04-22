import {
  APIGatewayProxyEvent, APIGatewayProxyResult
} from 'aws-lambda';
import * as aws from 'aws-sdk';

import { mergeDynamoQueries } from '@/deprecated/utils/dynamo';
import { parseDynamoDbAttributeMap } from '@/deprecated/utils/dynamodb';
import {
  getTwilioSecret, validateBodyIsJson
} from '@/deprecated/utils/general';
import { PagingTalkgroup } from '@/types/api/users';
import {
  SendPageQueueItem
} from '@/types/backend/queue';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('infra');

const dynamodb = new aws.DynamoDB();
const sqs = new aws.SQS();

const s3Bucket = process.env.S3_BUCKET;
const sqsQueue = process.env.SQS_QUEUE;
const dtrTable = process.env.TABLE_FILE;
const userTable = process.env.TABLE_USER;
const textTable = process.env.TABLE_TEXT;

interface GenericApiResponse {
  success: boolean;
  errors: string[];
  message?: string;
  data?: unknown[];
}

interface PageHttpBody {
  code: string;
  key: string;
  tg: PagingTalkgroup;
  len: number;
  isTest?: boolean;
}

async function handlePage(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  logger.trace('handlePage', ...arguments);
  // Validate the body
  validateBodyIsJson(event.body);

  // Parse the body
  const body: PageHttpBody = JSON.parse(event.body as string);
  const response: GenericApiResponse = {
    success: true,
    errors: [],
  };

  // Get the API code
  const twilioConf = await getTwilioSecret();

  // Validate the body
  if (!body.code || body.code !== twilioConf.apiCode) {
    response.success = false;
    response.errors.push('code');
    response.errors.push('key');
  }
  if (!body.key) {
    response.success = false;
    response.errors.push('key');
  }
  if (!body.tg) {
    response.success = false;
    response.errors.push('tg');
  }
  if (!body.len || typeof body.len !== 'number') {
    response.success = false;
    response.errors.push('len');
  }

  if (
    response.success &&
    body.key.indexOf('BG_FIRE') === -1 &&
    event.queryStringParameters?.action === 'dtrPage'
  ) {
    const sqsEvent: SendPageQueueItem = {
      action: 'page',
      key: body.key,
      tg: body.tg,
      len: body.len,
      isTest: !!body.isTest,
    };
    response.data = [ sqsEvent, ];

    await sqs.sendMessage({
      MessageBody: JSON.stringify(sqsEvent),
      QueueUrl: sqsQueue,
    }).promise();
  }

  if (!response.success) {
    logger.error('handlePage', '400', response);
  }

  return {
    statusCode: response.success ? 200 : 400,
    body: JSON.stringify(response),
  };
}

async function handleDtrExists(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  logger.trace('handleDtrExists', ...arguments);
  validateBodyIsJson(event.body);

  const s3 = new aws.S3();

  const files: string[] = JSON.parse(event.body as string).files;
  const badFiles: string[] = await Promise.all(files
    .map(f => s3.headObject({
      Bucket: s3Bucket,
      Key: `audio/dtr/${f}`,
    }).promise()
      .catch(() => f)))
    .then(data => data.filter(f => typeof f === 'string') as string[]);

  return {
    statusCode: 200,
    headers: {},
    body: JSON.stringify(badFiles),
  };
}

async function handleDtrExistsSingle(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  logger.trace('handleDtrExistsSingle', ...arguments);
  event.queryStringParameters = event.queryStringParameters || {};
  const response: GenericApiResponse & {
    exists: boolean;
  } = {
    success: true,
    exists: false,
    errors: [],
  };

  // Validate the query parameters
  if (
    !event.queryStringParameters.tg ||
    !(/^[0-9]+$/).test(event.queryStringParameters.tg)
  ) {
    response.errors.push('tg');
  }
  if (
    !event.queryStringParameters.start ||
    !(/^[0-9]+$/).test(event.queryStringParameters.start)
  ) {
    response.errors.push('start');
  }
  if (response.errors.length > 0) {
    response.success = false;
    return {
      statusCode: 400,
      body: JSON.stringify(response),
    };
  }

  // Find the item
  const result = await dynamodb.query({
    TableName: dtrTable,
    IndexName: 'StartTimeTgIndex',
    ExpressionAttributeNames: {
      '#tg': 'Talkgroup',
      '#st': 'StartTime',
    },
    ExpressionAttributeValues: {
      ':tg': {
        N: event.queryStringParameters.tg,
      },
      ':st': {
        N: event.queryStringParameters.start,
      },
    },
    KeyConditionExpression: '#tg = :tg AND #st = :st',
  }).promise();
  response.exists = typeof result.Items !== 'undefined' &&
    result.Items.length > 0;

  return {
    statusCode: 200,
    body: JSON.stringify(response),
  };
}

const testingUser = process.env.TESTING_USER as string;
async function handleTestState(
  event: APIGatewayProxyEvent,
  testOn: boolean
): Promise<APIGatewayProxyResult> {
  logger.trace('handleTestState', ...arguments);
  const response: GenericApiResponse = {
    success: true,
    errors: [],
  };

  // Get the API code
  const twilioConf = await getTwilioSecret();

  // Validate the code
  event.queryStringParameters = event.queryStringParameters || {};
  if (event.queryStringParameters.code !== twilioConf.apiCode) {
    response.success = false;
    response.errors.push('auth');
    logger.error('handleTestState', '400', response);
    return {
      statusCode: 400,
      body: JSON.stringify(response),
    };
  }

  // Update the user
  const updateConfig: aws.DynamoDB.UpdateItemInput = {
    TableName: userTable,
    Key: {
      phone: { N: testingUser, },
    },
    ExpressionAttributeNames: {
      '#it': 'isTest',
    },
    ExpressionAttributeValues: {
      ':it': { BOOL: true, },
    },
    UpdateExpression: 'SET #it = :it',
  };
  if (!testOn) {
    delete updateConfig.ExpressionAttributeValues;
    updateConfig.UpdateExpression = 'REMOVE #it';
  }

  await dynamodb.updateItem(updateConfig).promise();

  return {
    statusCode: 200,
    body: JSON.stringify(response),
  };
}

async function getTestTexts(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  logger.trace('getTestTexts', ...arguments);
  const response: GenericApiResponse = {
    success: true,
    errors: [],
  };

  // Get the API code
  const twilioConf = await getTwilioSecret();

  // Validate the code
  event.queryStringParameters = event.queryStringParameters || {};
  if (event.queryStringParameters.code !== twilioConf.apiCode) {
    response.success = false;
    response.errors.push('auth');
    logger.error('getTestTexts', '400', response);
    return {
      statusCode: 400,
      body: JSON.stringify(response),
    };
  }

  // Retrieve the texts
  const result = await mergeDynamoQueries(
    [
      {
        TableName: textTable,
        IndexName: 'testPageIndex',
        Limit: 50,
        ScanIndexForward: false,
        ExpressionAttributeNames: {
          '#tpi': 'testPageIndex',
        },
        ExpressionAttributeValues: {
          ':tpi': { S: 'yn', },
        },
        KeyConditionExpression: '#tpi = :tpi',
      },
      {
        TableName: textTable,
        IndexName: 'testPageIndex',
        Limit: 50,
        ScanIndexForward: false,
        ExpressionAttributeNames: {
          '#tpi': 'testPageIndex',
        },
        ExpressionAttributeValues: {
          ':tpi': { S: 'yy', },
        },
        KeyConditionExpression: '#tpi = :tpi',
      },
    ],
    'datetime'
  );
  response.data = result.Items?.map(parseDynamoDbAttributeMap);

  return {
    statusCode: 200,
    headers: {},
    body: JSON.stringify(response),
  };
}

export async function main(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  logger.debug('main', ...arguments);
  const action = event.queryStringParameters?.action || 'none';
  let result: APIGatewayProxyResult = {
    statusCode: 404,
    headers: {},
    body: JSON.stringify({
      error: true,
      message: `Invalid action '${action}'`,
    }),
  };
  logger.error(`Action: ${action}`);

  switch (action) {
    case 'page':
    case 'dtrPage':
      result = await handlePage(event);
      break;
    case 'dtrExists':
      result = await handleDtrExists(event);
      break;
    case 'dtrExistsSingle':
      result = await handleDtrExistsSingle(event);
      break;
    case 'startTest':
      result = await handleTestState(event, true);
      break;
    case 'endTest':
      result = await handleTestState(event, false);
      break;
    case 'getTexts':
      result = await getTestTexts(event);
      break;
  }

  return result;
}
