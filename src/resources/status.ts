import { Heartbeat } from '@/types/api/heartbeats';
import { TypedUpdateInput } from '@/types/backend/dynamo';
import { TABLE_STATUS } from '@/types/backend/environment';
import {
  typedScan, typedUpdate
} from '@/utils/backend/dynamoTyped';
import { sendAlertMessage } from '@/utils/backend/texts';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('status');

// The amount of time to wait for a heartbeat before failing over (in ms)
const maxSpacing = 5 * 60 * 1000;

export async function main() {
  logger.trace('main', ...arguments);

  // Get all of the heartbeats
  const heartbeatsScan = await typedScan<Heartbeat>({
    TableName: TABLE_STATUS(),
  });
  const heartbeats = heartbeatsScan.Items || [];

  const now = Date.now();
  const changedHeartbeats = heartbeats
    .filter(hb => (
      hb.IsFailed &&
      now - (hb.LastHeartbeat || 0) <= maxSpacing
    ) || (
      !hb.IsFailed &&
      now - (hb.LastHeartbeat || 0) >= maxSpacing
    ));

  const updateDynamoPromises = Promise.all(changedHeartbeats.map(hb => {
    hb.IsFailed = !hb.IsFailed;

    const updateConfig: TypedUpdateInput<Heartbeat> = {
      TableName: TABLE_STATUS(),
      Key: {
        Server: hb.Server,
      },
      ExpressionAttributeNames: {
        '#IsFailed': 'IsFailed',
      },
      ExpressionAttributeValues: {
        ':IsFailed': hb.IsFailed,
      },
      UpdateExpression: 'SET #IsFailed = :IsFailed',
    };

    // Set active to false if the heartbeat failed
    if (hb.IsFailed) {
      updateConfig.ExpressionAttributeValues = updateConfig.ExpressionAttributeValues || {};

      updateConfig.ExpressionAttributeNames['#IsActive'] = 'IsActive';
      updateConfig.ExpressionAttributeValues[':IsActive'] = false;
      updateConfig.UpdateExpression += ', #IsActive = :IsActive';
    }

    return typedUpdate(updateConfig);
  }));

  const messages = changedHeartbeats
    .map(hb => {
      const programCaps = 'VHF';
      const primaryHeartbeats = heartbeats.filter(hb2 => hb2.IsPrimary);
      const secondaryHeartbeats = heartbeats.filter(hb2 => !hb2.IsPrimary);

      const parts = {
        changed: `${hb.IsPrimary ? 'NSCFPD' : 'BGES'} ${programCaps} server (${hb.Server})`,
        all: `All ${programCaps} servers (${heartbeats.map(hb2 => hb2.Server).join(', ')})`,
        primary: `primary NSCFPD VHF server (${primaryHeartbeats.map(hb2 => hb2.Server).join(', ')})`,
        secondary: `primary BGES VHF server (${secondaryHeartbeats.map(hb2 => hb2.Server).join(', ')})`,
      };

      const primaryUp = primaryHeartbeats
        .filter(hb2 => !hb2.IsFailed)
        .length > 0;
      const secondaryUp = secondaryHeartbeats
        .filter(hb2 => !hb2.IsFailed)
        .length > 0;

      if (primaryUp && secondaryUp) {
        if (hb.IsPrimary) {
          return `${parts.changed} is back online. Switching NSCFPD VHF paging back to ${hb.Server}.`;
        } else {
          return `${parts.changed} is back online. BGES paging is back online.`;
        }
      } else if (!primaryUp && secondaryUp) {
        if (hb.IsPrimary) {
          return `${parts.changed} is down. Switching NSCFPD VHF paging to ${parts.secondary}.`;
        } else {
          return `${parts.changed} is back online. BGES paging is back online. Switching NSCFPD VHF paging to ${parts.secondary}, ${parts.primary} is still offline.`;
        }
      } else if (primaryUp && !secondaryUp) {
        if (hb.IsPrimary) {
          return `${parts.changed} is back online. Switching NSCFPD VHF paging to ${parts.primary}. BGES paging is still offline.`;
        } else {
          return `${parts.changed} is offline. BGES paging is offline. NSCFPD VHF paging is still online.`;
        }
      } else if (!primaryUp && !secondaryUp) {
        if (hb.IsPrimary) {
          return `${parts.changed} is offline. BGES and NSCFPD VHF paging are offline because ${parts.secondary} is still offline.`;
        } else {
          return `${parts.changed} is offline. BGES and NSCFPD VHF paging are offline because ${parts.primary} is still offline.`;
        }
      } else {
        return `Unkown state. IsPrimary: ${hb.IsPrimary}, primaryUp: ${primaryUp}, secondaryUp: ${secondaryUp}. MEOW.`;
      }
    });

  if (messages.length > 0) {
    logger.debug('main', 'alert messages', messages);
    await sendAlertMessage('Vhf', messages.join('\n'));
  }

  await updateDynamoPromises;
}
