import {
  GetObjectCommand, S3Client
} from '@aws-sdk/client-s3';

import { AlertCategory } from '@/types/backend/alerts';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('utils/backend/alarmStatus');

const s3 = new S3Client();

export const ALARM_S3_BUCKET = process.env.COSTS_BUCKET;
export const ALARM_S3_KEY = 'alarm-data.json';

export interface DataCache {
  [key: string]: {
    type: AlertCategory;
    lastAlarm?: number;
    lastOk?: number;
    lastOkSent?: number;
    lastReason?: string;
  };
}

export async function getCachedAlarmData(): Promise<DataCache> {
  try {
    const rawData = await s3.send(new GetObjectCommand({
      Bucket: ALARM_S3_BUCKET,
      Key: ALARM_S3_KEY,
    }));

    if (typeof rawData.Body === 'undefined') {
      return {};
    }

    return JSON.parse(await rawData?.Body.transformToString('utf-8')) as DataCache;
  } catch (e) {
    logger.error('Failed to get cached alarm data', e);
    throw e;
  }
}
