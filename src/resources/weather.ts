import * as AWS from 'aws-sdk';
import fetch from 'node-fetch';
import { parse } from 'node-html-parser';

import {
  FireTypes, WeatherResultJson
} from '@/deprecated/common/weather';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('weather');

interface GaccUrlObject {
  new: string;
  ongoing: string;
  rx: string;
}

interface GaccJson {
  features: {
    properties: {
      POOState: string;
      POOCounty: string;
    }
  }[];
}

interface NwsAlert {
  onset: string;
  ends: string;
  expires: string;
  description: string;
  associated: NwsAlert[];
  headline: string;
  event: string;
}

interface NwsJson {
  features: {
    properties: NwsAlert;
  }[]
}

const allowedCounties: string[] = [ 'Saguache', ];
const currentFireUrls: GaccUrlObject = {
  new: 'https://gbcc.us/rmcc_newfires.geojson',
  ongoing: 'https://gbcc.us/rmcc_ongoingfires.geojson',
  rx: 'https://gbcc.us/rmcc_rxfires.geojson',
};
const readiness = 'https://gacc.nifc.gov/rmcc/';
const weatherAlertsApi = 'https://api.weather.gov/alerts/active?point=37.993%2C-105.699';
const countyRestrictionUrl = 'https://www.google.com/maps/d/u/0/embed?mid=1cEAhNHqp82AXABF8qU7k6sRFI4392V0e&ll=38.91583034559253%2C-106.1196738784554&z=8';

const s3Bucket = process.env.S3_BUCKET;
const s3File = 'weather.json';

async function processGaccUrl(url: string): Promise<number[]> {
  logger.trace('processGaccUrl', ...arguments);
  try {
    const data: GaccJson = await fetch(url)
      .then(r => r.json());

    return data.features
      .filter(f => f.properties.POOState === 'US-CO')
      .reduce((agg: number[], feature) => {
        if (agg.length < 2) {
          agg = [
            0,
            0,
          ];
        }
        agg[1]++;
        if (allowedCounties.includes(feature.properties.POOCounty)) {
          agg[0]++;
        }
        return agg;
      }, []);
  } catch (e) {
    logger.error('processGaccUrl', e);
    return [
      -1,
      -1,
    ];
  }
}

async function getStateFires(): Promise<WeatherResultJson['stateFires']> {
  logger.trace('getStateFires', ...arguments);
  try {
    const keys: FireTypes[] = Object.keys(currentFireUrls) as FireTypes[];

    const gaccData = await Promise.all(keys.map(key => processGaccUrl(currentFireUrls[key])));

    return gaccData.reduce((agg: WeatherResultJson['stateFires'], data, ind) => {
      agg[keys[ind]] = data;
      return agg;
    }, {
      new: [
        -1,
        -1,
      ],
      ongoing: [
        -1,
        -1,
      ],
      rx: [
        -1,
        -1,
      ],
    });
  } catch (e) {
    logger.error('getStateFires', e);
    return {
      new: [
        -1,
        -1,
      ],
      ongoing: [
        -1,
        -1,
      ],
      rx: [
        -1,
        -1,
      ],
    };
  }
}

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

function buildTimeframe(onset: string, ends: string): string {
  logger.trace('buildTimeframe', ...arguments);
  const dOnset = new Date(onset);
  const dEnds = new Date(ends);

  const isSameDate = dOnset.getFullYear() === dEnds.getFullYear() &&
    dOnset.getMonth() === dEnds.getMonth() &&
    dOnset.getDate() === dEnds.getDate();

  const sOnsetInput = dateToLocalString(dOnset);
  const sEndsInput = dateToLocalString(dEnds);

  if (isSameDate) {
    return `${sOnsetInput[0]} from ${sOnsetInput[1]} to ${sEndsInput[1]}`;
  } else {
    return `From ${sOnsetInput[0]} at ${sOnsetInput[1]} to ${sEndsInput[0]} at ${sEndsInput[1]}`;
  }
}

async function getAreaAlerts(): Promise<WeatherResultJson['weather']> {
  logger.trace('getAreaAlerts', ...arguments);
  try {
    const weatherAlerts: NwsJson = await fetch(weatherAlertsApi, {
      headers: {
        'User-Agent': 'klawil willyk95@gmail.com',
        Accept: 'application/geo+json',
      },
    }).then(r => r.json());

    const featuresToReturn: NwsAlert[] = [];
    weatherAlerts.features
      .map(feature => feature.properties)
      .sort((a, b) => new Date(a.onset).getTime() > new Date(b.onset).getTime() ? 1 : -1)
      .reduce((fMap: { [key: string]: NwsAlert }, feature) => {
        const description = feature.description;
        if (typeof fMap[description] !== 'undefined') {
          fMap[description].associated = fMap[description].associated || [];
          fMap[description].associated.push(feature);
        } else {
          featuresToReturn.push(feature);
          fMap[description] = feature;
          feature.associated = feature.associated || [];
          feature.associated.push(feature);
        }

        return fMap;
      }, {});

    return featuresToReturn
      .map(feature => {
        let featureString = `<b>${feature.headline}</b>\n\n${feature.description.replace(/([^\n])\n([^\n])/g, (a, b, c) => `${b} ${c}`)}\n\n`;
        featureString += feature.associated
          .map(f => `* <b>${f.event}</b>... ${buildTimeframe(f.onset, f.ends || f.expires)}`)
          .join('\n\n');

        return featureString;
      })
      .join('\n\n\n')
      .replace(/\n/g, '<br>')
      .replace(/(\.\.\.)([^ ])/g, (a, b, c) => `${b} ${c}`);
  } catch (e) {
    logger.error('getAreaAlerts', e);
    return '';
  }
}

async function getCountyRestrictions(): Promise<WeatherResultJson['bans']> {
  logger.trace('getCountyRestrictions', ...arguments);
  try {
    const html = await fetch(countyRestrictionUrl)
      .then(r => r.text());

    const json = html
      .split('\n')
      .filter(line => line.indexOf('var _pageData = ') !== -1)[0]
      .match(/_pageData = (".*?");<\/script>/);

    if (!json) {
      throw new Error('Cannot find page data');
    }

    const _pageData = JSON.parse(eval(json[1]));

    return _pageData[1][6][0][12][0][13][0]
      .filter((f: any) => f[5][0][1][0] === 'Saguache') // eslint-disable-line @typescript-eslint/no-explicit-any
      .map((f: any) => f[5][3][0][1][0]) // eslint-disable-line @typescript-eslint/no-explicit-any
      .join('\n\n\n')
      .replace(/\n/g, '<br>');
  } catch (e) {
    logger.error('getCountyRestrictions', e);
    return '';
  }
}

async function uploadFile(text: string) {
  logger.trace('uploadFile', ...arguments);
  const s3 = new AWS.S3();

  const uploadParams = {
    Bucket: s3Bucket,
    Key: s3File,
    Body: text,
  };

  return await s3.upload(uploadParams).promise();
}

export async function main() {
  logger.trace('main', ...arguments);
  try {
    const dataRaw = await Promise.all([
      getStateFires(),
      getReadinessInfo(),
      getAreaAlerts(),
      getCountyRestrictions(),
    ]);
    const data: WeatherResultJson = {
      stateFires: dataRaw[0],
      readiness: dataRaw[1],
      weather: dataRaw[2],
      bans: dataRaw[3],
      updated: `Data fetched on ${dateToLocalString(new Date()).join(' at ')}`,
    };
    await uploadFile(JSON.stringify(data));
  } catch (e) {
    logger.error('main', e);
  }
}
