import fetch from 'node-fetch';
import { parse } from 'node-html-parser';
import * as AWS from 'aws-sdk';
import { WeatherResultJson } from '../common/weather';

interface GaccUrlObject {
	new: string;
	ongoing: string;
	rx: string;
	team: string;
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
};

const allowedCounties: string[] = [
  'Saguache'
];
const currentFireUrls: GaccUrlObject = {
  new: 'https://gbcc.us/rmcc_newfires.geojson',
  ongoing: 'https://gbcc.us/rmcc_ongoingfires.geojson',
  rx: 'https://gbcc.us/rmcc_rxfires.geojson',
  team: 'https://gbcc.us/rmcc_teamfires.geojson'
};
const readiness = 'https://gacc.nifc.gov/rmcc/';
const weatherAlertsApi = 'https://api.weather.gov/alerts/active?point=37.993%2C-105.699';
const countyRestrictionUrl = 'https://www.google.com/maps/d/u/0/embed?mid=1cEAhNHqp82AXABF8qU7k6sRFI4392V0e&ll=38.91583034559253%2C-106.1196738784554&z=8';

const s3Bucket = process.env.S3_BUCKET as string;
const s3File = 'weather.json';

function processGaccUrl(url: string): Promise<number[]> {
  return fetch(url)
    .then(r => r.json())
    .then(data => (data as GaccJson).features)
    .then(features => features.filter(f => f.properties.POOState === 'US-CO'))
    .then(coFeatures => [
      coFeatures.filter(f => allowedCounties.includes(f.properties.POOCounty)).length,
      coFeatures.length
    ])
    .catch(e => [-1, -1]);
}

function getStateFires(): Promise<WeatherResultJson['stateFires']> {
  const keys: (keyof WeatherResultJson['stateFires'])[] = Object.keys(currentFireUrls) as unknown as (keyof WeatherResultJson['stateFires'])[];
  return Promise.all(keys.map(key => processGaccUrl(currentFireUrls[key as keyof GaccUrlObject])))
    .then(data => data.reduce((agg: WeatherResultJson['stateFires'], data, ind) => {
      agg[keys[ind] as keyof WeatherResultJson['stateFires']] = data;
      return agg;
    }, {}))
    .catch(e => {
			console.error(e);
			return {};
		});
}

function getReadinessInfo(): Promise<WeatherResultJson['readiness']> {
  return fetch(readiness)
    .then(r => r.text())
    .then(html => parse(html))
    .then(dom => {
      const readiness = [ ...dom.querySelectorAll('.readiness td') ]
        .map(item => item.innerHTML.trim());
      const levels = [ ...dom.querySelectorAll('.readlevel td') ]
        .map(item => item.innerHTML.trim());
      
      if (readiness.length !== levels.length) {
        return {};
      }

      return readiness.reduce((agg: WeatherResultJson['readiness'], label, index) => {
        agg[label] = parseInt(levels[index]);
        return agg;
      }, {});
    })
    .catch(e => {
			console.error(e);
			return {};
		});
}

function dateToLocalString(d: Date): string[] {
	let dateString = d.toLocaleDateString('en-US', {
		timeZone: 'America/Denver',
		weekday: 'short',
		month: 'short',
		day: '2-digit'
	});
  
	let timeString = d.toLocaleTimeString('en-US', {
		timeZone: 'America/Denver',
		hour12: false,
		hour: '2-digit',
		minute: '2-digit'
	})
		.replace(/:/g, '');

	return [
    dateString,
    timeString
  ];
}

function buildTimeframe(onset: string, ends: string): string {
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

function getAreaAlerts(): Promise<WeatherResultJson['weather']> {
  return fetch(weatherAlertsApi, {
    headers: {
      'User-Agent': 'klawil willyk95@gmail.com',
      Accept: 'application/geo+json'
    }
  })
    .then(r => r.json() as Promise<NwsJson>)
    .then((body: NwsJson) => body.features.map(f => f.properties))
    .then(features => features.sort((a, b) => new Date(a.onset).getTime() > new Date(b.onset).getTime() ? 1 : -1))
    .then(features => {
      const featuresToReturn: NwsAlert[] = [];
      features.reduce((fMap: { [key: string]: NwsAlert }, feature) => {
        const description = feature.description;
        if (typeof fMap[description] !== 'undefined') {
          fMap[description].associated = fMap[description].associated || [];
          (fMap[description].associated as NwsAlert[]).push(feature);
        } else {
          featuresToReturn.push(feature);
          fMap[description] = feature;
          feature.associated = feature.associated || [];
          feature.associated.push(feature);
        }

        return fMap;
      }, {});
      return featuresToReturn;
    })
    .then(features => features.map(feature => {
      let featureString = `<b>${feature.headline}</b>\n\n${feature.description.replace(/([^\n])\n([^\n])/g, (a, b, c) => `${b} ${c}`)}\n\n`;
      featureString += feature.associated
        .map(f => `* <b>${f.event}</b>... ${buildTimeframe(f.onset, f.ends || f.expires)}`)
        .join('\n\n');

      return featureString;
    }))
    .then(r => r.join('\n\n\n'))
    .then(str => str.replace(/\n/g, '<br>'))
    .then(str => str.replace(/(\.\.\.)([^ ])/g, (a, b, c) => `${b} ${c}`));
}

function getCountyRestrictions(): Promise<WeatherResultJson['bans']> {
  return fetch(countyRestrictionUrl)
    .then(r => r.text())
    .then(html => html.split('\n').filter(line => line.indexOf('var _pageData = ') !== -1)[0])
    .then(line => line.match(/_pageData = (".*?");<\/script>/))
		.then(lines => {
			if (!lines) {
				throw new Error('No page data found');
			}

			return lines[1];
		})
    .then(js => {
      let _pageData = eval(js);
      return JSON.parse(_pageData);
    })
    .then(data => data[1][6][0][12][0][13][0]
      .filter((f: any) => f[5][0][1][0] === 'Saguache'))
    .then(data => data.map((f: any) => f[5][3][0][1][0]).join('\n\n\n'))
    .then(str => str.replace(/\n/g, '<br>'));
}

function uploadFile(text: string) {
  const s3 = new AWS.S3();

  const uploadParams = {
    Bucket: s3Bucket,
    Key: s3File,
    Body: text
  };

  return s3.upload(uploadParams).promise();
}

export async function main() {
	return Promise.all([
		getStateFires(),
		getReadinessInfo(),
		getAreaAlerts(),
		getCountyRestrictions()
	])
		.then(data => ({
			stateFires: data[0],
			readiness: data[1],
			weather: data[2],
			bans: data[3],
			updated: `Data fetched on ${dateToLocalString(new Date()).join(' at ')}`
		}))
		.then((data: WeatherResultJson) => JSON.stringify(data))
		.then(data => uploadFile(data))
		.catch(console.error);
}
