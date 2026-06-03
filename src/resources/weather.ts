import {
  // GetObjectCommand,
  PutObjectCommand, S3Client
} from '@aws-sdk/client-s3';
import fetch from 'node-fetch';
import { parse } from 'node-html-parser';

import {
  WeatherResultJson
} from '@/deprecated/common/weather';
import { BUCKET_AUDIO } from '@/types/backend/environment';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('weather');

const readiness = 'https://gacc.nifc.gov/rmcc/';

const s3File = 'weather.json';

async function getReadinessInfo(): Promise<WeatherResultJson['readiness']> {
  logger.trace('getReadinessInfo', ...arguments);
  try {
    const html = await fetch(readiness)
      .then(r => r.text());

    const dom = parse(html);

    const readinessInfo: { [key: string]: number } = {};
    Array.from(dom.querySelectorAll('td center strong'))
      .reduce((agg: string | null, item) => {
        if (agg === null) {
          return item.innerHTML;
        }

        readinessInfo[agg] = Number(item.innerHTML.split(' ')[1]);

        return null;
      }, null);
    return readinessInfo;
  } catch (e) {
    logger.error('getReadinessInfo', e);
    return {};
  }
}

function dateToLocalString(d: Date): string[] {
  logger.trace('dateToLocalString', ...arguments);
  const dateString = d.toLocaleDateString('en-US', {
    timeZone: 'America/Denver',
    weekday: 'short',
    month: 'short',
    day: '2-digit',
  });

  const timeString = d.toLocaleTimeString('en-US', {
    timeZone: 'America/Denver',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })
    .replace(/:/g, '');

  return [
    dateString,
    timeString,
  ];
}

async function uploadFile(text: string) {
  logger.trace('uploadFile', ...arguments);
  const s3 = new S3Client();

  const uploadParams = {
    Bucket: BUCKET_AUDIO(),
    Key: s3File,
    Body: text,
  };

  return await s3.send(new PutObjectCommand(uploadParams));
}

export async function main() {
  logger.trace('main', ...arguments);
  try {
    const data: WeatherResultJson = {
      readiness: await getReadinessInfo(),
      updated: `Data fetched on ${dateToLocalString(new Date()).join(' at ')}`,
    };
    await uploadFile(JSON.stringify(data));
  } catch (e) {
    logger.error('main', e);
  }
}
