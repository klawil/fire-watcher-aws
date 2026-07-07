import {
  PutObjectCommand, S3Client
} from '@aws-sdk/client-s3';
import fetch from 'node-fetch';
import { parse } from 'node-html-parser';

import {
  FireBoundaryInfo,
  FireData,
  WeatherResultJson
} from '@/deprecated/common/weather';
import { BUCKET_AUDIO } from '@/types/backend/environment';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('weather');

const readiness = 'https://gacc.nifc.gov/rmcc/';

const activeIncidentsUrl = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/WFIGS_Incident_Locations/FeatureServer/0/query';
const activeIncidentsBody = {
  where: 'ControlDateTime IS NULL AND ContainmentDateTime IS NULL AND FireOutDateTime IS NULL AND ModifiedOnDateTime_dt >= CURRENT_TIMESTAMP - 2',
  outFields: 'ContainmentDateTime,ControlDateTime,CpxName,DiscoveryAcres,EstimatedCostToDate,EstimatedFinalCost,FinalAcres,FireBehaviorGeneral,FireBehaviorGeneral1,FireBehaviorGeneral2,FireBehaviorGeneral3,FireCause,FireCauseGeneral,FireCauseSpecific,FireDiscoveryDateTime,FireOutDateTime,FireStrategyConfinePercent,FireStrategyFullSuppPercent,FireStrategyMonitorPercent,FireStrategyPointZonePercent,IncidentComplexityLevel,IncidentManagementOrganization,IncidentName,IncidentSize,IncidentTypeCategory,ModifiedOnDateTime_dt,OBJECTID,OrganizationalAssessment,PercentContained,PredominantFuelGroup,PredominantFuelModel,PrimaryFuelModel,SecondaryFuelModel,TotalIncidentPersonnel',
  outSR: '4326',
  f: 'geojson',
  returnGeometry: 'true',
} as const;

const activeBoundariesUrl = 'https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query';
const activeBoundariesBody = {
  where: 'attr_ControlDateTime IS NULL AND attr_ContainmentDateTime IS NULL AND attr_FireOutDateTime IS NULL AND attr_ModifiedOnDateTime_dt >= CURRENT_TIMESTAMP - 2',
  outFields: 'poly_IncidentName,attr_CpxName',
  outSR: '4326',
  f: 'geojson',
  returnGeometry: 'true',
} as const;

const fileLocations = {
  readiness: 'weather.json',
  activeFires: 'active-fires.json',
  activeBoundaries: 'active-boundaries.json',
} as const;

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

async function uploadFile(key: string, text: string) {
  logger.trace('uploadFile', ...arguments);
  const s3 = new S3Client();

  const uploadParams = {
    Bucket: BUCKET_AUDIO(),
    Key: key,
    Body: text,
  };

  return await s3.send(new PutObjectCommand(uploadParams));
}

async function updateActiveIncidents() {
  try {
    const response = await fetch(
      `${activeIncidentsUrl}?${(Object.keys(activeIncidentsBody) as (keyof typeof activeIncidentsBody)[])
        .map(key => `${key}=${encodeURIComponent(activeIncidentsBody[key])}`)
        .join('&')}`
    );

    const fireData = (await response.json()) as {
      features?: FireData['activeFires'];
    };
    if (typeof fireData.features !== 'undefined') {
      const data: FireData = {
        activeFires: fireData.features,
        updated: `Data fetched on ${dateToLocalString(new Date()).join(' at ')}`,
      };
      await uploadFile(fileLocations.activeFires, JSON.stringify(data));
    } else {
      logger.warn('updateActiveIncidents', 'No features found in the response');
    }
  } catch (e) {
    logger.error('updateActiveIncidents', e);
  }
}

async function updateActiveBoundaries() {
  try {
    const response = await fetch(
      `${activeBoundariesUrl}?${(Object.keys(activeBoundariesBody) as (keyof typeof activeBoundariesBody)[])
        .map(key => `${key}=${encodeURIComponent(activeBoundariesBody[key])}`)
        .join('&')}`
    );

    const fireData = (await response.json()) as {
      features?: FireBoundaryInfo['activeBoundaries'];
    };
    if (typeof fireData.features !== 'undefined') {
      const data: FireBoundaryInfo = {
        activeBoundaries: fireData.features,
        updated: `Data fetched on ${dateToLocalString(new Date()).join(' at ')}`,
      };
      await uploadFile(fileLocations.activeBoundaries, JSON.stringify(data));
    } else {
      logger.warn('updateActiveBoundaries', 'No features found in the response');
    }
  } catch (e) {
    logger.error('updateActiveBoundaries', e);
  }
}

async function updateReadinessInfo() {
  logger.trace('updateReadinessInfo', ...arguments);
  try {
    const data: WeatherResultJson = {
      readiness: await getReadinessInfo(),
      updated: `Data fetched on ${dateToLocalString(new Date()).join(' at ')}`,
    };
    await uploadFile(fileLocations.readiness, JSON.stringify(data));
  } catch (e) {
    logger.error('updateReadinessInfo', e);
  }
}

export async function main() {
  logger.trace('main', ...arguments);
  await Promise.all([
    updateReadinessInfo(),
    updateActiveIncidents(),
    updateActiveBoundaries(),
  ]);
}
