import {
  CloudWatchClient,
  ListTagsForResourceCommand
} from '@aws-sdk/client-cloudwatch';
import {
  PutObjectCommand, S3Client
} from '@aws-sdk/client-s3';
import * as lambda from 'aws-lambda';

import { AlertCategory } from '@/types/backend/alerts';
import {
  ALARM_S3_BUCKET, ALARM_S3_KEY, getCachedAlarmData
} from '@/utils/backend/alarmStatus';
import { sendAlertMessage } from '@/utils/backend/texts';
import { getLogger } from '@/utils/common/logger';
import { dateToTimeString } from '@/utils/common/strings';

const logger = getLogger('alarms');

const cloudWatch = new CloudWatchClient();
const s3 = new S3Client();

const minOkayTime = 15 * 60 * 1000; // 15 minutes

export async function main(
  event: lambda.CloudWatchAlarmEvent | lambda.EventBridgeEvent<'event', null>
): Promise<void> {
  logger.trace('main', ...arguments);

  const cachedDataPromise = getCachedAlarmData();

  let alarmChange: null | {
    name: string;
    newState: string;
    reason: string;
    type: AlertCategory;
  } = null;
  const nowTime = Date.now();

  if ('alarmArn' in event) {
    const tags: {
      'cofrn-alarm-type': AlertCategory;
      [key: string]: string;
    } = {
      'cofrn-alarm-type': 'Api',
    };
    try {
      const alarmInfo = await cloudWatch.send(new ListTagsForResourceCommand({
        ResourceARN: event.alarmArn,
      }));
      alarmInfo.Tags?.forEach(tag => {
        if (
          typeof tag.Key === 'undefined' ||
          typeof tag.Value === 'undefined'
        ) {
          return;
        }
        tags[tag.Key] = tag.Value;
      });
    } catch (e) {
      logger.error('main', e);
    }

    const alarmData = event.alarmData;
    const transitionTime = new Date(event.time);
    let alertMessage = `Alarm for ${alarmData.alarmName} transitioned from ${alarmData.previousState.value} to ${alarmData.state.value} ${dateToTimeString(transitionTime)}.\n\n`;
    if (alarmData.state.value !== 'OK') {
      alertMessage += `Impact: ${alarmData.configuration.description}\n\n`;
    }
    alertMessage += `Reason For Change: ${alarmData.state.reason}`;
    alarmChange = {
      name: alarmData.alarmName,
      newState: alarmData.state.value,
      reason: alertMessage,
      type: tags['cofrn-alarm-type'],
    };
  }

  const cachedData = await cachedDataPromise;
  let cacheChanged = false;

  // Send a net new alarm
  if (alarmChange) {
    cachedData[alarmChange.name] = cachedData[alarmChange.name] || {
      type: alarmChange.type,
    };
    const alarmCacheData = cachedData[alarmChange.name];
    alarmCacheData.lastReason = alarmChange.reason;

    switch (alarmChange.newState) {
      case 'OK':
        alarmCacheData.lastOk = nowTime;
        break;
      case 'ALARM':
        if (
          typeof alarmCacheData.lastAlarm === 'undefined' ||
          (
            alarmCacheData.lastOk &&
            alarmCacheData.lastOkSent &&
            alarmCacheData.lastOkSent > alarmCacheData.lastOk
          )
        ) {
          await sendAlertMessage(alarmChange.type, alarmChange.reason);
        }
        alarmCacheData.lastAlarm = nowTime;
        break;
    }
    cacheChanged = true;
  }

  // Send the okay messages if enough time has elapsed
  await Promise.all(Object.keys(cachedData)
    .map(alarmName => {
      const alarmData = cachedData[alarmName];
      if (
        !alarmData.lastOk ||
        (
          alarmData.lastAlarm &&
          alarmData.lastOk < alarmData.lastAlarm
        ) ||
        alarmData.lastOk > nowTime - minOkayTime ||
        !alarmData.lastReason ||
        (
          alarmData.lastOkSent &&
          alarmData.lastOkSent > alarmData.lastOk
        )
      ) {
        return;
      }

      alarmData.lastOkSent = nowTime;
      cacheChanged = true;
      return sendAlertMessage(alarmData.type, alarmData.lastReason);
    }));

  if (cacheChanged) {
    await s3.send(new PutObjectCommand({
      Bucket: ALARM_S3_BUCKET,
      Key: ALARM_S3_KEY,
      Body: JSON.stringify(cachedData),
    }));
  }
}
