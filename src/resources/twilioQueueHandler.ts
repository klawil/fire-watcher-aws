import { SQSEvent } from 'aws-lambda';

import { FullTextObject } from '@/types/api/texts';
import { TypedUpdateInput } from '@/types/backend/dynamo';
import { TwilioQueueEvent } from '@/types/backend/twilioQueue';
import {
  TABLE_TEXT, typedUpdate
} from '@/utils/backend/dynamoTyped';

async function handleMessage(id: number, events: TwilioQueueEvent[]) {
  // Make the base update config
  const updateConfig: TypedUpdateInput<FullTextObject> = {
    TableName: TABLE_TEXT,
    Key: {
      datetime: id,
    },
    ExpressionAttributeNames: {},
    ExpressionAttributeValues: {
      ':blankList': [],
    },
  };
  const updateStrings: string[] = [];

  // Add to the config for each event
  events.forEach(event => {
    const updateKey = event.status;
    if (typeof updateConfig.ExpressionAttributeNames[`#${updateKey}K`] === 'undefined') {
      updateConfig.ExpressionAttributeNames[`#${updateKey}K`] = updateKey;
      updateConfig.ExpressionAttributeNames[`#${updateKey}PhoneK`] = `${updateKey}Phone`;
      updateStrings.push(`#${updateKey}K = list_append(if_not_exists(#${updateKey}K, :blankList), :${updateKey})`);
      updateStrings.push(
        `#${updateKey}PhoneK = list_append(if_not_exists(#${updateKey}PhoneK, :blankList), :${updateKey}Phone)`
      );
    }

    updateConfig.ExpressionAttributeValues = updateConfig.ExpressionAttributeValues || {};
    updateConfig.ExpressionAttributeValues[`:${updateKey}`] = updateConfig.ExpressionAttributeValues[`:${updateKey}`] || [];
    updateConfig.ExpressionAttributeValues[`:${updateKey}Phone`] = updateConfig.ExpressionAttributeValues[`:${updateKey}Phone`] || [];

    updateConfig.ExpressionAttributeValues[`:${updateKey}`]?.push(event.eventTime);
    updateConfig.ExpressionAttributeValues[`:${updateKey}Phone`]?.push(event.phone);
  });

  // Finalize the config and execute the update
  updateConfig.UpdateExpression = 'SET ' + updateStrings.join(', ');
  await typedUpdate(updateConfig);
}

export async function main(event: SQSEvent) {
  const events: TwilioQueueEvent[] = event.Records.map(e => JSON.parse(e.body));

  // Break the events out into different message IDs
  const messageIds = events.reduce((agg: number[], item) => {
    if (!agg.includes(item.datetime)) {
      agg.push(item.datetime);
    }

    return agg;
  }, []);

  // Parse each message's updates
  await Promise.all(messageIds.map(id => handleMessage(
    id,
    events.filter(e => e.datetime === id)
  )));
}
