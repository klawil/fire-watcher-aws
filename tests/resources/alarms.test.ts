import * as lambda from 'aws-lambda';
import {
  beforeEach,
  describe, expect,
  it,
  vi
} from 'vitest';

import { CloudWatchClientMock } from '../../__mocks__/@aws-sdk/client-cloudwatch';
import {
  GetObjectCommand, PutObjectCommand, S3Mock
} from '../../__mocks__/@aws-sdk/client-s3';

import { main } from '@/resources/alarms';
import { sendAlertMessage } from '@/utils/backend/texts';

const defaultTransitionTime = 1735693261000;
const currentTime = defaultTransitionTime + 1000;
// const currentTimeString = new Date(currentTime).toISOString();

const makeS3MockResponse = (body: string) => ({
  Body: {
    transformToString: () => Promise.resolve(body),
  },
});

function generateAlarmEvent(
  isAlarm: boolean,
  alarmState: 'OK' | 'ALARM' = 'OK',
  changeTime: number = 0
): lambda.CloudWatchAlarmEvent | lambda.EventBridgeEvent<'event', null> {
  if (!isAlarm) {
    return {
      id: 'testEventId',
      version: 'v1',
      account: 'accountValue',
      time: '1234567890123',
      region: 'us-east-1',
      resources: [],
      source: 'aws.events',
      'detail-type': 'event',
      detail: null,
    };
  }

  return {
    source: 'aws.alarms',
    alarmArn: 'alarmArnValue',
    accountId: 'accountIdValue',
    time: new Date(changeTime).toISOString(),
    region: 'us-east-2',
    alarmData: {
      alarmName: 'testAlarmName',
      state: {
        value: alarmState,
        reason: 'stateReasonNew',
        timestamp: new Date(changeTime).toISOString(),
      },
      previousState: {
        value: alarmState === 'OK' ? 'ALARM' : 'OK',
        reason: 'stateReasonOld',
        timestamp: new Date(changeTime - 1000).toISOString(),
      },
      configuration: {
        metrics: [],
        description: 'AlarmDescription',
      },
    },
  };
}

function generateAlarmCache(
  lastReason: string,
  lastAlarm: number | null,
  lastOk: number | null,
  lastOkSent: number | null
) {
  const testAlarmValues: {
    type: 'Vhf';
    lastAlarm?: number;
    lastOk?: number;
    lastOkSent?: number;
    lastReason?: string;
  } = {
    type: 'Vhf',
    lastReason,
  };
  if (lastAlarm !== null) {
    testAlarmValues.lastAlarm = lastAlarm;
  }
  if (lastOk !== null) {
    testAlarmValues.lastOk = lastOk;
  }
  if (lastOkSent !== null) {
    testAlarmValues.lastOkSent = lastOkSent;
  }

  return {
    testAlarmName: testAlarmValues,
  };
}

describe('@/resources/alarms', () => {
  describe('main', () => {
    beforeEach(() => {
      vi.useFakeTimers().setSystemTime(currentTime);

      vi.mocked(sendAlertMessage).mockResolvedValue();

      CloudWatchClientMock.setResult('listTagsForResource', {
        Tags: [ {
          Key: 'cofrn-alarm-type',
          Value: 'Vhf',
        }, ],
      });
    });

    it('Sends an ALARM mesage if an un-cached alarm is triggered', async () => {
      CloudWatchClientMock.setResult('listTagsForResource', {
        Tags: [
          {
            Key: 'cofrn-alarm-type',
            Value: 'Vhf',
          },
          {
            Key: 'cofrn-alarm-type',
          },
          {
            Value: 'Dtr',
          },
        ],
      });

      await main(generateAlarmEvent(
        true,
        'ALARM',
        defaultTransitionTime
      ));

      expect(sendAlertMessage).toHaveBeenCalledTimes(1);
      expect(sendAlertMessage).toHaveBeenCalledWith(
        'Vhf',
        'Alarm for testAlarmName transitioned from OK to ALARM on Tue, Dec 31 at 18:01:01.\n\n' +
        'Impact: AlarmDescription\n\n' +
        'Reason For Change: stateReasonNew'
      );

      expect(PutObjectCommand).toHaveBeenCalledTimes(1);
      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'COSTS_BUCKET_VAL',
        Key: 'alarm-data.json',
        Body: JSON.stringify({
          testAlarmName: {
            type: 'Vhf',
            lastReason: 'Alarm for testAlarmName transitioned from OK to ALARM on Tue, Dec 31 at 18:01:01.\n\nImpact: AlarmDescription\n\nReason For Change: stateReasonNew',
            lastAlarm: currentTime,
          },
        }),
      });

      expect(GetObjectCommand).toHaveBeenCalledTimes(1);
      expect(GetObjectCommand).toHaveBeenCalledWith({
        Bucket: 'COSTS_BUCKET_VAL',
        Key: 'alarm-data.json',
      });
    });

    it('Caches the alarm state change if an alarm changes to OK', async () => {
      await main(generateAlarmEvent(
        true,
        'OK',
        defaultTransitionTime
      ));

      expect(sendAlertMessage).toHaveBeenCalledTimes(0);

      expect(PutObjectCommand).toHaveBeenCalledTimes(1);
      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'COSTS_BUCKET_VAL',
        Key: 'alarm-data.json',
        Body: JSON.stringify({
          testAlarmName: {
            type: 'Vhf',
            lastReason: 'Alarm for testAlarmName transitioned from ALARM to OK on Tue, Dec 31 at 18:01:01.\n\nReason For Change: stateReasonNew',
            lastOk: currentTime,
          },
        }),
      });
    });

    it('Does not send an ALARM message if the alarm OK message has not been sent', async () => {
      S3Mock.setResult('get', makeS3MockResponse(JSON.stringify(generateAlarmCache(
        'testReasonLastCache',
        defaultTransitionTime,
        defaultTransitionTime - 10000,
        defaultTransitionTime - 15000
      ))));

      await main(generateAlarmEvent(
        true,
        'ALARM',
        defaultTransitionTime
      ));

      expect(sendAlertMessage).toHaveBeenCalledTimes(0);

      expect(PutObjectCommand).toHaveBeenCalledTimes(1);
      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'COSTS_BUCKET_VAL',
        Key: 'alarm-data.json',
        Body: JSON.stringify({
          testAlarmName: {
            type: 'Vhf',
            lastReason: 'Alarm for testAlarmName transitioned from OK to ALARM on Tue, Dec 31 at 18:01:01.' +
            '\n\nImpact: AlarmDescription' +
            '\n\nReason For Change: stateReasonNew',
            lastAlarm: currentTime,
            lastOk: defaultTransitionTime - 10000,
            lastOkSent: defaultTransitionTime - 15000,
          },
        }),
      });
    });

    it('Sends an ALARM message if the alarm OK message has been sent', async () => {
      S3Mock.setResult('get', makeS3MockResponse(JSON.stringify(generateAlarmCache(
        'testReasonLastCache',
        null,
        defaultTransitionTime - 10000,
        defaultTransitionTime - 5000
      ))));

      await main(generateAlarmEvent(
        true,
        'ALARM',
        defaultTransitionTime
      ));

      expect(sendAlertMessage).toHaveBeenCalledTimes(1);
      expect(sendAlertMessage).toHaveBeenCalledWith(
        'Vhf',
        'Alarm for testAlarmName transitioned from OK to ALARM on Tue, Dec 31 at 18:01:01.\n\n' +
        'Impact: AlarmDescription\n\n' +
        'Reason For Change: stateReasonNew'
      );

      expect(PutObjectCommand).toHaveBeenCalledTimes(1);
      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'COSTS_BUCKET_VAL',
        Key: 'alarm-data.json',
        Body: JSON.stringify({
          testAlarmName: {
            type: 'Vhf',
            lastReason: 'Alarm for testAlarmName transitioned from OK to ALARM on Tue, Dec 31 at 18:01:01.' +
            '\n\nImpact: AlarmDescription' +
            '\n\nReason For Change: stateReasonNew',
            lastOk: defaultTransitionTime - 10000,
            lastOkSent: defaultTransitionTime - 5000,
            lastAlarm: currentTime,
          },
        }),
      });
    });

    it('Sends an OK message after the alarm has been okay for 15 minutes', async () => {
      S3Mock.setResult('get', makeS3MockResponse(JSON.stringify(generateAlarmCache(
        'testReasonLastCache',
        null,
        defaultTransitionTime - (15 * 60 * 1000),
        null
      ))));

      await main(generateAlarmEvent(false));

      expect(sendAlertMessage).toHaveBeenCalledTimes(1);
      expect(sendAlertMessage).toHaveBeenCalledWith(
        'Vhf',
        'testReasonLastCache'
      );

      expect(PutObjectCommand).toHaveBeenCalledTimes(1);
      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'COSTS_BUCKET_VAL',
        Key: 'alarm-data.json',
        Body: JSON.stringify({
          testAlarmName: {
            type: 'Vhf',
            lastReason: 'testReasonLastCache',
            lastOk: defaultTransitionTime - (15 * 60 * 1000),
            lastOkSent: currentTime,
          },
        }),
      });
    });

    it('Sends no message if the alarm has been okay for less than 15 minutes', async () => {
      S3Mock.setResult('get', makeS3MockResponse(JSON.stringify(generateAlarmCache(
        'testReasonLastCache',
        null,
        defaultTransitionTime - (13 * 60 * 1000),
        null
      ))));

      await main(generateAlarmEvent(false));

      expect(sendAlertMessage).toHaveBeenCalledTimes(0);
      expect(PutObjectCommand).toHaveBeenCalledTimes(0);
    });

    it('Sends no message if the OKAY message has already been sent', async () => {
      S3Mock.setResult('get', makeS3MockResponse(JSON.stringify(generateAlarmCache(
        'testReasonLastCache',
        null,
        defaultTransitionTime - (16 * 60 * 1000),
        defaultTransitionTime - (60 * 1000)
      ))));

      await main(generateAlarmEvent(false));

      expect(sendAlertMessage).toHaveBeenCalledTimes(0);
      expect(PutObjectCommand).toHaveBeenCalledTimes(0);
    });
  });
});
