import { Firehose } from 'aws-sdk';

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
const firehose = new Firehose();

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
    await firehose.putRecordBatch({
      DeliveryStreamName: FIREHOSE_NAME,
      Records: validItems.map(item => ({
        Data: JSON.stringify({
          ...item,
          timestamp: eventTime,
        }),
      })),
    }).promise();
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
