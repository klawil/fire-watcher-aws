import {
  Lambda,
  S3
  // SQS
} from 'aws-sdk';

import { FullFileObject } from '@/types/api/files';
import {
  TABLE_FILE, typedQuery
} from '@/utils/backend/dynamoTyped';
import { fNameToDate } from '@/utils/common/strings';

const s3 = new S3();
// const sqs = new SQS();
const lambda = new Lambda();

const FILE_BUCKET = process.env.S3_BUCKET;
const CACHE_BUCKET = process.env.COSTS_BUCKET;
// const QUEUE = process.env.S3_QUEUE as string;

interface CacheObject {
  ContinuationToken?: string;
  checked: number;
  deleted: number;
  newChecked: number;
  newDeleted: number;
  maxC: number;
  time: number;
}

const CACHE_FILE_NAME = 's3_parser.json';
const FILE_PREFIX = 'audio/dtr/';

// 10 minutes (actual lambda function timeout is 14 minutes)
const MAX_EXECUTION_TIME = 12 * 60 * 1000;
// const MAX_EXECUTION_TIME = 4 * 60 * 1000;

async function promiseAllMaxConcurrent<T>(
  values: T[],
  func: (a: T) => Promise<void>,
  maxConcurrency: number = 10
): Promise<void> {
  let currentIdx = 0;
  const promises: Promise<void>[] = [];
  for (let i = 0; i < maxConcurrency; i++) {
    promises.push((async () => {
      let fnIdx: number;
      while ((fnIdx = currentIdx++) < values.length) {
        await func(values[fnIdx]);
      }
    })());
  }

  await Promise.all(promises);
}

export async function main() {
  const startTime = Date.now();

  // Get the cache
  const cache: CacheObject = {
    checked: 0,
    deleted: 0,
    newChecked: 0,
    newDeleted: 0,
    maxC: 200,
    time: 0,
  };
  try {
    const data = await s3.getObject({
      Bucket: CACHE_BUCKET,
      Key: CACHE_FILE_NAME,
    }).promise();
    if (typeof data.Body !== 'undefined') {
      const cachedData = JSON.parse(data.Body.toString()) as CacheObject;
      cache.checked = cachedData.checked;
      cache.deleted = cachedData.deleted;
      cache.newChecked = cachedData.newChecked || 0;
      cache.newDeleted = cachedData.newDeleted || 0;
      cache.ContinuationToken = cachedData.ContinuationToken;
      cache.time = cachedData.time || 0;
    }
  } catch (e) {
    console.log('No found cache', e);
  }
  console.log('Start', cache);

  while (Date.now() - startTime < MAX_EXECUTION_TIME) {
    // List the files
    const fileList = await s3.listObjectsV2({
      Bucket: FILE_BUCKET,
      Prefix: FILE_PREFIX,
      ...cache.ContinuationToken
        ? { ContinuationToken: cache.ContinuationToken, }
        : {},
    }).promise();
    const keys = fileList.Contents
      ?.map(c => c.Key)
      .filter(c => typeof c !== 'undefined') || [];

    // Parse the files
    await promiseAllMaxConcurrent(
      keys,
      async key => {
        // Don't process files from the past hour
        if (Date.now() - fNameToDate(key).getTime() < (60 * 60 * 1000)) return;

        // Get the DynamoDB data
        const dynamoItem = await typedQuery<FullFileObject>({
          TableName: TABLE_FILE,
          IndexName: 'KeyIndex',
          ExpressionAttributeNames: {
            '#Key': 'Key',
          },
          ExpressionAttributeValues: {
            ':Key': key,
          },
          KeyConditionExpression: '#Key = :Key',
        });

        // If there is no dynamo item, delete the file in S3
        if (
          !dynamoItem.Items ||
          dynamoItem.Items.length === 0
        ) {
          cache.deleted++;
          cache.newDeleted++;
          await s3.deleteObject({
            Bucket: FILE_BUCKET,
            Key: key,
          }).promise();
        }
        cache.checked++;
        cache.newChecked++;
      },
      cache.maxC || 10
    );

    cache.ContinuationToken = fileList.NextContinuationToken;
    if (typeof fileList.NextContinuationToken === 'undefined') {
      const {
        Contents: _,
        ...d
      } = fileList;
      console.log(d);
      console.log('DONE - no cont token');
      break;
    }
  }

  const secs = Math.ceil((Date.now() - startTime) / 1000);
  cache.time += secs;
  console.log('END', {
    ...cache,
    runTime: secs,
  });
  console.log(
    'KLAWIL-END',
    `${cache.maxC},${cache.checked},${cache.deleted},${cache.newChecked},${cache.newDeleted},${cache.time},${secs}`
  );

  // Store the cache
  await s3.putObject({
    Bucket: CACHE_BUCKET,
    Key: CACHE_FILE_NAME,
    Body: JSON.stringify(cache),
  }).promise();

  if (typeof cache.ContinuationToken !== 'undefined') {
    await lambda.invoke({
      FunctionName: process.env.AWS_LAMBDA_FUNCTION_NAME as string,
      InvocationType: 'Event',
    }).promise();
    console.log('Next run invoked');
  }
}
