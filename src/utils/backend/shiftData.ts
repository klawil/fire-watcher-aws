import {
  GetObjectCommand, S3Client
} from '@aws-sdk/client-s3';

import { getLogger } from '@/utils/common/logger';

const logger = getLogger('utils/backend/shiftData');

const s3 = new S3Client();

export const SHIFT_S3_BUCKET = process.env.COSTS_BUCKET;
export const SHIFT_S3_KEY = 'shift-data.json';

export interface ShiftData {
  people: {
    [id: string]: string;
  };
  shifts: {
    id: string;
    start: number;
    end: number;
    department: string;
  }[];
}

export async function getShiftData(): Promise<ShiftData> {
  try {
    const rawData = await s3.send(new GetObjectCommand({
      Bucket: SHIFT_S3_BUCKET,
      Key: SHIFT_S3_KEY,
    }));

    if (typeof rawData.Body === 'undefined') {
      return {
        people: {},
        shifts: [],
      };
    }

    return JSON.parse(await rawData?.Body.transformToString('utf-8')) as ShiftData;
  } catch (e) {
    logger.error('Failed to get cached alarm data', e);
    return {
      people: {},
      shifts: [],
    };
  }
}
