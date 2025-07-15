import {
  FirehoseClient, PutRecordBatchCommand
} from '@aws-sdk/client-firehose';

import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';

import {
  api200Body, generateApi400Body
} from '@/types/api/_shared';
import {
  AddEventsApi, eventItemValidator
} from '@/types/api/events';
import { validateObject } from '@/utils/backend/validation';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('resources/api/v2/events');
const firehose = new FirehoseClient();

const FIREHOSE_NAME = process.env.FIREHOSE_NAME;

const POST: LambdaApiFunction<AddEventsApi> = async function (event) {
  logger.trace('POST', ...arguments);
  const eventTime = Date.now();

  // Parse the body
  const body = JSON.parse(event.body || '');
  if (
    !body ||
    !Array.isArray(body)
  ) {
    return [
      400,
      generateApi400Body([]),
    ];
  }

  // Get the valid items from the body
  const validItems: AddEventsApi['body'] = [];
  const allItemErrors: string[] = [];
  body.forEach((item, idx) => {
    const [
      parsedItem,
      itemErrors,
    ] = validateObject(item, eventItemValidator);
    if (itemErrors.length > 0) {
      allItemErrors.push(...itemErrors.map(v => `${idx}-${v}`));
    } else if (!parsedItem) {
      allItemErrors.push(`${idx}-null`);
    } else {
      validItems.push(parsedItem);
    }
  });

  // Send the valid items to the firehose
  if (validItems.length > 0) {
    const encoder = new TextEncoder();
    await firehose.send(new PutRecordBatchCommand({
      DeliveryStreamName: FIREHOSE_NAME,
      Records: validItems.map(item => {
        const timestamp = typeof item.timestamp !== 'undefined'
          ? item.timestamp
          : eventTime;

        const dateTime = new Date(timestamp);
        const datePartition = `${dateTime.getUTCFullYear()}-` +
          `${(dateTime.getUTCMonth() + 1).toString().padStart(2, '0')}-` +
          `${dateTime.getUTCDate().toString()
            .padStart(2, '0')}-` +
          `${dateTime.getUTCHours().toString()
            .padStart(2, '0')}`;

        return {
          Data: encoder.encode(JSON.stringify({
            ...item,
            timestamp,
            datePartition,
          })),
        };
      }),
    }));
  }

  // Return either the errors or a 200
  if (allItemErrors.length > 0) {
    return [
      400,
      generateApi400Body(allItemErrors),
    ];
  }
  return [
    200,
    api200Body,
  ];
};

export const main = handleResourceApi.bind(null, {
  POST,
});
