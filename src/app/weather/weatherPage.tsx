'use client';

import { FeatureLayerOptions } from 'esri-leaflet';
import {
  Feature, FeatureCollection
} from 'geojson';
import L, {
  Layer, PathOptions
} from 'leaflet';
import {
  useContext, useEffect, useState
} from 'react';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';
import {
  DynamicMapLayer, FeatureLayer
} from 'react-esri-leaflet';
import {
  GeoJSON, LayersControl, MapContainer, TileLayer,
  useMapEvents
} from 'react-leaflet';

import styles from './weather.module.css';

import LoadingSpinner from '@/components/loadingSpinner/loadingSpinner';
import {
  FireBoundaryInfo,
  FireData,
  FireInfo, WeatherResultJson, getFireType, isFireActive
} from '@/deprecated/common/weather';
import { dateTimeToTimeStr } from '@/utils/common/dateAndFile';
import { getLogger } from '@/utils/common/logger';
import { AddAlertContext } from '@/utils/frontend/clientContexts';

import 'leaflet/dist/leaflet.css';

const CorrectedFeatureLayer = FeatureLayer as unknown as React.ComponentType<{
  style?: PathOptions;
  transparent?: boolean;
  opacity?: number;
} & Omit<FeatureLayerOptions, 'style'>>;

const logger = getLogger('weatherPage');

const numberFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
});
const currencyFormat = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 2,
  style: 'currency',
  currency: 'USD',
  maximumSignificantDigits: 3,
});

function FireMarker(fire: FireInfo): L.Marker {
  const type = getFireType(fire);

  const current = fire.properties.IncidentSize === null
    ? null
    : numberFormat.format(fire.properties.IncidentSize);
  const start = fire.properties.DiscoveryAcres === null
    ? null
    : numberFormat.format(fire.properties.DiscoveryAcres);
  const final = fire.properties.FinalAcres === null
    ? null
    : numberFormat.format(fire.properties.FinalAcres);

  const marker = new L.Marker(
    [
      fire.geometry.coordinates[1],
      fire.geometry.coordinates[0],
    ],
    {
      opacity: isFireActive(fire) ? 1 : 0.5,
      icon: L.icon({
        iconUrl: `/icons/${type == 'new' ? 'red' : type == 'rx' ? 'green' : 'black'}.png`,
        iconSize: [
          32,
          32,
        ],
        iconAnchor: [
          16,
          32,
        ],
        popupAnchor: [
          0,
          -32,
        ],
      }),
    }
  );
  let popupContent = `<b>${fire.properties.IncidentName}</b>`;
  if (fire.properties.CpxName) {
    popupContent += `<br /><i>Part of the ${fire.properties.CpxName}</i>`;
  }

  /* Timestamps */
  const timeLines: string[] = [];
  if (fire.properties.FireDiscoveryDateTime) {
    timeLines.push(`Discovered: ${dateTimeToTimeStr(fire.properties.FireDiscoveryDateTime)}`);
  }
  if (fire.properties.ContainmentDateTime) {
    timeLines.push(`Contained: ${dateTimeToTimeStr(fire.properties.ContainmentDateTime)}`);
  }
  if (fire.properties.ControlDateTime) {
    timeLines.push(`Controlled: ${dateTimeToTimeStr(fire.properties.ControlDateTime)}`);
  }
  if (fire.properties.FireOutDateTime) {
    timeLines.push(`Fire Out: ${dateTimeToTimeStr(fire.properties.FireOutDateTime)}`);
  }
  if (fire.properties.ModifiedOnDateTime_dt) {
    timeLines.push(`Updated: ${dateTimeToTimeStr(fire.properties.ModifiedOnDateTime_dt)}`);
  }
  if (timeLines.length > 0) {
    popupContent += `<hr>${timeLines.join('<br />')}`;
  }

  const sizeLines: string[] = [];
  if (start) {
    sizeLines.push(`Initial Size: ${start}ac`);
  }
  if (current) {
    sizeLines.push(`${isFireActive(fire) ? 'Current' : 'Final'} Size: ${current}ac`);
  }
  if (final) {
    sizeLines.push(`Final Size: ${final}ac`);
  }
  if (sizeLines.length > 0) {
    popupContent += `<hr>${sizeLines.join('<br />')}`;
  }

  const complexityLines: string[] = [];
  if (fire.properties.OrganizationalAssessment) {
    complexityLines.push(`Organizational Assessment: ${fire.properties.OrganizationalAssessment}`);
  }
  if (fire.properties.IncidentManagementOrganization) {
    complexityLines.push(`Current Team: ${fire.properties.IncidentManagementOrganization}`);
  }
  if (fire.properties.IncidentComplexityLevel) {
    complexityLines.push(`Highest Team: ${fire.properties.IncidentComplexityLevel}`);
  }
  if (complexityLines.length > 0) {
    popupContent += `<hr>${complexityLines.join('<br />')}`;
  }

  const strategyLines: string[] = [];
  if (fire.properties.PercentContained !== null) {
    strategyLines.push(`Currently Contained: ${fire.properties.PercentContained}%`);
  }
  if (fire.properties.FireStrategyConfinePercent) {
    strategyLines.push(`Strategy Confine: ${fire.properties.FireStrategyConfinePercent}%`);
  }
  if (fire.properties.FireStrategyFullSuppPercent) {
    strategyLines.push(`Strategy Full Suppression: ${fire.properties.FireStrategyFullSuppPercent}%`);
  }
  if (fire.properties.FireStrategyMonitorPercent) {
    strategyLines.push(`Strategy Monitor: ${fire.properties.FireStrategyFullSuppPercent}%`);
  }
  if (fire.properties.FireStrategyPointZonePercent) {
    strategyLines.push(`Strategy Point Zone Protection: ${fire.properties.FireStrategyFullSuppPercent}%`);
  }
  if (strategyLines.length > 0) {
    popupContent += `<hr>${strategyLines.join('<br />')}`;
  }

  const costLines: string[] = [];
  if (fire.properties.EstimatedCostToDate !== null) {
    costLines.push(`Estimated Cost to Date: ${currencyFormat.format(fire.properties.EstimatedCostToDate)}`);
  }
  if (fire.properties.EstimatedFinalCost !== null) {
    costLines.push(`Estimated Final Cost: ${currencyFormat.format(fire.properties.EstimatedFinalCost)}`);
  }
  if (fire.properties.TotalIncidentPersonnel !== null) {
    costLines.push(`Current Personnel: ${numberFormat.format(fire.properties.TotalIncidentPersonnel)}`);
  }
  if (costLines.length > 0) {
    popupContent += `<hr>${costLines.join('<br />')}`;
  }

  const fireBehaviorLines: string[] = [];
  if (fire.properties.FireBehaviorGeneral) {
    fireBehaviorLines.push(`General Fire Behavior: ${fire.properties.FireBehaviorGeneral}`);
  }
  if (fire.properties.FireBehaviorGeneral1) {
    fireBehaviorLines.push(`Fire Behavior 1: ${fire.properties.FireBehaviorGeneral1}`);
  }
  if (fire.properties.FireBehaviorGeneral2) {
    fireBehaviorLines.push(`Fire Behavior 2: ${fire.properties.FireBehaviorGeneral2}`);
  }
  if (fire.properties.FireBehaviorGeneral3) {
    fireBehaviorLines.push(`Fire Behavior 3: ${fire.properties.FireBehaviorGeneral3}`);
  }
  if (fireBehaviorLines.length > 0) {
    popupContent += `<hr>${fireBehaviorLines.join('<br />')}`;
  }

  const fuelLines: string[] = [];
  if (fire.properties.PredominantFuelGroup) {
    fuelLines.push(`Predominant Fuel Group: ${fire.properties.PredominantFuelGroup}`);
  }
  if (fire.properties.PredominantFuelModel) {
    fuelLines.push(`Predominant Fuel Model: ${fire.properties.PredominantFuelModel}`);
  }
  if (fire.properties.PrimaryFuelModel) {
    fuelLines.push(`Primary Fuel Model: ${fire.properties.PrimaryFuelModel}`);
  }
  if (fire.properties.SecondaryFuelModel) {
    fuelLines.push(`Secondary Fuel Model: ${fire.properties.SecondaryFuelModel}`);
  }
  if (fuelLines.length > 0) {
    popupContent += `<hr>${fuelLines.join('<br />')}`;
  }

  const causeLines: string[] = [];
  if (fire.properties.FireCause) {
    causeLines.push(`Cause: ${fire.properties.FireCause}`);
  }
  if (fire.properties.FireCauseGeneral) {
    causeLines.push(`General Cause: ${fire.properties.FireCauseGeneral}`);
  }
  if (fire.properties.FireCauseSpecific) {
    causeLines.push(`Specific Cause: ${fire.properties.FireCauseSpecific}`);
  }
  if (causeLines.length > 0) {
    popupContent += `<hr>${causeLines.join('<br />')}`;
  }

  if (fire) {
    marker.bindPopup(popupContent);
  }

  marker.bindTooltip(`${fire.properties?.IncidentName || 'Unknown Incident Name'}${fire.properties.CpxName ? `<br />${fire.properties.CpxName}` : ''}`, {
    direction: 'bottom',
  });
  return marker;
}

function getPolygonSize(geometry: FeatureCollection['features'][number]['geometry']): number {
  if (geometry.type !== 'Polygon') {
    return 0;
  }
  const points = geometry.coordinates.flat();
  const min0 = points.reduce((min, coord) => Math.min(min, coord[0]), Infinity);
  const max0 = points.reduce((max, coord) => Math.max(max, coord[0]), -Infinity);
  const min1 = points.reduce((min, coord) => Math.min(min, coord[1]), Infinity);
  const max1 = points.reduce((max, coord) => Math.max(max, coord[1]), -Infinity);
  return (max0 - min0) * (max1 - min1);
}

function useWeatherAlerts(activeLayers: string[]): FeatureCollection | null {
  const [
    alertsGeoJson,
    setAlertsGeoJson,
  ] = useState<FeatureCollection | null>(null);
  const [
    isStarted,
    setIsStarted,
  ] = useState<boolean>(false);

  useEffect(() => {
    if (activeLayers.includes('Weather Alerts') && !isStarted) {
      setIsStarted(true);
      (async () => {
        const activeAlertsGeoJson = await fetch('https://api.weather.gov/alerts/active?area=CO')
          .then(r => r.json()) as FeatureCollection;

        let done = 0;
        let needed = 0;

        activeAlertsGeoJson.features
          .filter(feature => feature.geometry === null &&
            feature.properties?.affectedZones !== undefined)
          .map(f => f.properties?.affectedZones?.map((zone: string) => ({
            zone: zone,
            feature: f,
          })))
          .flat()
          .forEach(({
            zone,
            feature,
          }) => {
            needed++;
            fetch(zone).then(r => r.json())
              .then((zoneGeom: FeatureCollection['features'][number]) => {
                activeAlertsGeoJson.features.push({
                  ...feature,
                  geometry: zoneGeom.geometry,
                });
                done++;
                if (done >= needed) {
                  activeAlertsGeoJson.features = activeAlertsGeoJson.features
                    .filter(f => f.geometry !== null)
                    .sort((a, b) => {
                      const aSize = a.geometry ? getPolygonSize(a.geometry) : 0;
                      const bSize = b.geometry ? getPolygonSize(b.geometry) : 0;
                      return bSize - aSize;
                    });
                  setAlertsGeoJson(activeAlertsGeoJson);
                }
              });
          });
        if (done >= needed) {
          setAlertsGeoJson(activeAlertsGeoJson);
        }
      })();
    }
  }, [
    activeLayers,
    isStarted,
  ]);

  return alertsGeoJson;
}

function useActiveFires(): FeatureCollection | null {
  const [
    firesGeoJson,
    setFiresGeoJson,
  ] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    (async () => {
      const activeFiresGeoJson = await fetch('/active-fires.json')
        .then(r => r.json()) as FireData;

      setFiresGeoJson({
        type: 'FeatureCollection',
        features: activeFiresGeoJson.activeFires,
      });
    })();
  }, []);

  return firesGeoJson;
}

function useActiveBoundaries(activeLayers: string[]): FeatureCollection | null {
  const [
    firesGeoJson,
    setFiresGeoJson,
  ] = useState<FeatureCollection | null>(null);
  const [
    isStarted,
    setIsStarted,
  ] = useState<boolean>(false);

  useEffect(() => {
    if (activeLayers.includes('Active Fire Boundaries') && !isStarted) {
      setIsStarted(true);
      (async () => {
        try {
          const activeBoundariesGeoJson = await fetch('/active-boundaries.json')
            .then(r => r.json()) as FireBoundaryInfo;
          console.log(activeBoundariesGeoJson);

          setFiresGeoJson({
            type: 'FeatureCollection',
            features: activeBoundariesGeoJson.activeBoundaries,
          });
        } catch (e) {
          logger.error('Error fetching active boundaries:', e);
        }
      })();
    }
  }, [
    activeLayers,
    isStarted,
  ]);

  return firesGeoJson;
}

function MapLayerEvents({
  setActiveLayers,
}: Readonly<{
  setActiveLayers: React.Dispatch<React.SetStateAction<string[]>>;
}>) {
  useMapEvents({
    overlayadd: e => {
      // Triggers when an overlay is checked (shown)
      console.log(`Overlay shown: ${e.name}`);
      setActiveLayers(old => [
        ...old,
        e.name,
      ]);
    },
    overlayremove: e => {
      // Triggers when an overlay is unchecked (hidden)
      console.log(`Overlay hidden: ${e.name}`);
      setActiveLayers(old => [ ...old.filter(name => name !== e.name), ]);
    },
  });

  return null;
}

interface LegendLayer {
  layerId: string[];
  layerName: string;
  legend: {
    label: string;
    url?: string;
    imageData?: string;
    opacity?: number;
    contentType: string;
    height: number;
    width: number;
  }[];
}

const legendLayers: LegendLayer[] = [
  {
    layerId: [ 'Active Fires', ],
    layerName: 'Active Fires',
    legend: [
      {
        label: 'New Start',
        url: '/icons/red.png',
        contentType: 'image/png',
        opacity: 1,
        height: 32,
        width: 32,
      },
      {
        label: 'Working Fire',
        url: '/icons/black.png',
        contentType: 'image/png',
        opacity: 1,
        height: 32,
        width: 32,
      },
      {
        label: 'RX Fire',
        url: '/icons/green.png',
        contentType: 'image/png',
        opacity: 1,
        height: 32,
        width: 32,
      },
    ],
  },
  {
    layerId: [ 'Old Fires (Last 7 Days)', ],
    layerName: 'Old Fires',
    legend: [
      {
        label: 'New Start',
        url: '/icons/red.png',
        contentType: 'image/png',
        height: 32,
        width: 32,
      },
      {
        label: 'Working Fire',
        url: '/icons/black.png',
        contentType: 'image/png',
        height: 32,
        width: 32,
      },
      {
        label: 'RX Fire',
        url: '/icons/green.png',
        contentType: 'image/png',
        height: 32,
        width: 32,
      },
    ],
  },
  {
    layerId: [ 'Day 1 Fire Outlook', ],
    layerName: 'Fire Outlooks',
    legend: [
      {
        label: 'Critical',
        imageData: 'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAATklEQVQ4jWPpLwtt4WH64cBABfDlH8cBFpBhKSKbralh4Jw3vgwsDFQGLKMGUgxYKDcCFYwaSDlgoYIZKGDUwBERhl/+cRwAlbTUACCzADHWEfn/zM1pAAAAAElFTkSuQmCC',
        contentType: 'image/png',
        height: 20,
        width: 20,
      },
      {
        label: 'Ignition',
        imageData: 'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAATklEQVQ4jWPpDw1t4fnxw4GBCuALB8cBFpBhKZs3W1PDwDm+vgwsDFQGLKMGUgxYKDcCFYwaSDlgoYIZKGDUwBERhl84OA6ASlpqAJBZABsMEEPJw84rAAAAAElFTkSuQmCC',
        contentType: 'image/png',
        height: 20,
        width: 20,
      },
      {
        label: 'Level 3 Dry',
        imageData: 'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAATklEQVQ4jWNpr8tr4WBldGCgAvjx+/8BFpBhXoYM1tQwcNt5RgYWBioDllEDKQYslBuBCkYNpBywUMEMFDBq4IgIwx+//x8AlbTUACCzABBMEbzt4XedAAAAAElFTkSuQmCC',
        contentType: 'image/png',
        height: 20,
        width: 20,
      },
      {
        label: 'Level 2 Dry',
        imageData: 'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAATklEQVQ4jWPp709p4eH548BABfDlC8sBFpBhKSkPrKlh4Jw5CgwsDFQGLKMGUgxYKDcCFYwaSDlgoYIZKGDUwBERhl++sBwAlbTUACCzAIDiEZYbkn41AAAAAElFTkSuQmCC',
        contentType: 'image/png',
        height: 20,
        width: 20,
      },
      {
        label: 'Level 1 Dry',
        imageData: 'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAW0lEQVQ4jWPJy8v7z0BFwAIifio/Yfgj+Ikyg97zMbDflYEYCDKMUgNBgB3mQmoCllEDKQYslBuBCkYNpBywUMEMFDBqIOUAHIagwpFig6BmgA0ElbSgwpEaAADh3A+oW2tLigAAAABJRU5ErkJggg==',
        contentType: 'image/png',
        height: 20,
        width: 20,
      },
      {
        label: 'Level 0 Dry',
        imageData: 'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAT0lEQVQ4jWOpqqpqYWZmdmCgAvj79+8BFpBh8vLy1tQw8OHDhwwsDFQGLKMGUgxYKDcCFYwaSDlgoYIZKGDUwBERhn///j0AKmmpAUBmAQDLvhPYSGMPyAAAAABJRU5ErkJggg==',
        contentType: 'image/png',
        height: 20,
        width: 20,
      },
      {
        label: 'Other Value',
        imageData: 'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAT0lEQVQ4jWNp7uxvYefkdmCgAvj5/esBFpBhtkFJ1tQw8PC6eQwsDFQGLKMGUgxYKDcCFYwaSDlgoYIZKGDUwBERhj+/fz0AKmmpAUBmAQBSBRNf9sgPFAAAAABJRU5ErkJggg==',
        contentType: 'image/png',
        height: 20,
        width: 20,
      },
    ],
  },
  {
    layerId: [
      'Day 1 Fire Weather',
      'Day 2 Fire Weather',
    ],
    layerName: 'Fire Weather (Day 1-2)',
    legend: [
      {
        label: 'Elevated',
        imageData: 'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAATklEQVQ4jWPpLg/x52D5oc5ABfDjD8dNFpBhwbJblKlh4NrHPgwsDFQGLKMGUgxYKDcCFYwaSDlgoYIZKGDUwBERhj/+cNwElbTUACCzAJkyEcqHbYnRAAAAAElFTkSuQmCC',
        contentType: 'image/png',
        height: 20,
        width: 20,
      },
      {
        label: 'Critical',
        imageData: 'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAATklEQVQ4jWPpCwnx5/7xQ52BCuArB8dNFpBhaVu2KFPDwFk+PgwsDFQGLKMGUgxYKDcCFYwaSDlgoYIZKGDUwBERhl85OG6CSlpqAJBZAI59EAko87DfAAAAAElFTkSuQmCC',
        contentType: 'image/png',
        height: 20,
        width: 20,
      },
      {
        label: 'Extreme',
        imageData: 'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAATklEQVQ4jWPpDqn25/jBqs5ABfCD4/dNFpBhwVs0lKlh4FqfGwwsDFQGLKMGUgxYKDcCFYwaSDlgoYIZKGDUwBERhj84ft8ElbTUACCzALaqEcKTf449AAAAAElFTkSuQmCC',
        contentType: 'image/png',
        height: 20,
        width: 20,
      },
      {
        label: 'Iso Dry T-Storm',
        imageData: 'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAATklEQVQ4jWMpjAvx///7hzoDFQAjK8dNFpBhzGe3KFPDwL/GPgwsDFQGLKMGUgxYKDcCFYwaSDlgoYIZKGDUwBERhoysHDdBJS01AMgsANgzD0nU7Z8HAAAAAElFTkSuQmCC',
        contentType: 'image/png',
        height: 20,
        width: 20,
      },
      {
        label: 'Scattered Dry T-Storm',
        imageData: 'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAATklEQVQ4jWPpCwnx5/7xQ52BCuArB8dNFpBhaVu2KFPDwFk+PgwsDFQGLKMGUgxYKDcCFYwaSDlgoYIZKGDUwBERhl85OG6CSlpqAJBZAI59EAko87DfAAAAAElFTkSuQmCC',
        contentType: 'image/png',
        height: 20,
        width: 20,
      },
    ],
  },
  {
    layerId: [
      'Day 3 Fire Weather',
      'Day 4 Fire Weather',
      'Day 5 Fire Weather',
      'Day 6 Fire Weather',
      'Day 7 Fire Weather',
      'Day 8 Fire Weather',
    ],
    layerName: 'Fire Weather (Day 3-8)',
    legend: [
      {
        label: 'Dry T-Storm Marginal (10%)',
        imageData: 'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAACXBIWXMAAA7EAAAOxAGVKw4bAAABDUlEQVQ4ja1UQQ6EIAwcE/61eOc3cBfv7m+4y8/YlFBSkd01Yg8GaJ2WdhhlDRL6FgHozvrnXvUCJmDeAqI12Mv54ed3wOwMdEL2Q/qVDKADAmInnQtQSrRuAZ7jnMGcgKUF1M7Ac2BrBPqlJZw8lmKo4iVfmRbO5IAu6AXTpdLawwwK3ANMBYwB24mNWMw95M1dlAlYeTjqSvP/2RbgrcGLAeMIWEOxJK/8WA9B5B2t0pYnzD38Se4LYPuJNiM8hGDK0z3USnLpAR5CCbDbxN4CPGnBQRwALNYgFomq4DQs8VZPnBWyl8ldr1yMhkMTrwJLe+lnirHAstxTMYceSpGgQA7o+DNokygno+8HUt2At8DRtIoAAAAASUVORK5CYII=',
        contentType: 'image/png',
        height: 20,
        width: 20,
      },
      {
        label: 'Dry T-Storm Critical (40%)',
        imageData: 'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAA90lEQVQ4ja2U0RGEIAxElxn6OuyIDtAO6Ag6y02IUVDUm8P9OkLuKWFdC0+EvjIA1/l9u7YXDROiyfCU1nr752gmeOJaWmvbvj00oIBUUlcoa0E089bnaQIQjkAHT/PWeBRDryQPZ7CeIuiRAzzhEvost77pNkOBAv8CQzvDdugjyjLDdTEAWvRy7E/Df1I0Mzx9FCi2GVUsFqP6yK/NEMW8o2/p5RPWGd6b+xmWerYZ8aHr2eYNOXvw0qgPYatCHvQh2nCQgGAoR9QO58vav9WzZ/fYK+auj8ySGOKcawN231eLtQHL4HK5NbAOiaQNnX2Bni+zrL/KSXCErUDXlAAAAABJRU5ErkJggg==',
        contentType: 'image/png',
        height: 20,
        width: 20,
      },
      {
        label: 'Wind/Humidity Marginal (40%)',
        imageData: 'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAWElEQVQ4je3UsQ2AMAxE0bN0gyVDsCQMkWxmBEgJrs+lfxW5eIpcmH7CkRjXyzAlydE2aJh2oEvehfGg+4dJsUA56kSsQD0mGKEC9b4dOtp7z5TCgf0N1G7KiBAfv2n4/QAAAABJRU5ErkJggg==',
        contentType: 'image/png',
        height: 20,
        width: 20,
      },
      {
        label: 'Wind/Humidity Critical (70%)',
        imageData: 'iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAWUlEQVQ4je3UsQ2AMAxE0Y90S7ANTA7TwBhBRiLC9bn0r6IUT1GK0wWDwvQdFjgdaMA2wcBW2B3whiPQ+cKq1KCdfCLXoJ8KjFSDfu8fxo7FnjlQGtj/hdsDE0ANmXugs2UAAAAASUVORK5CYII=',
        contentType: 'image/png',
        height: 20,
        width: 20,
      },
    ],
  },
];

export default function WeatherPage() {
  const addAlert = useContext(AddAlertContext);
  const [
    weatherData,
    setWeatherData,
  ] = useState<WeatherResultJson | null | undefined>();
  const [
    isLoading,
    setIsLoading,
  ] = useState(false);
  useEffect(() => {
    if (typeof weatherData !== 'undefined' || isLoading) {
      return;
    }

    setIsLoading(true);
    (async () => {
      try {
        const result: WeatherResultJson = await fetch('/weather.json')
          .then(r => r.json());

        setWeatherData(result);
      } catch (e) {
        logger.error('Failed to get weather information', e);
        addAlert('danger', 'Failed to load weather information');
        setWeatherData(null);
      }
      setIsLoading(false);
    })();
  }, [
    isLoading,
    weatherData,
    addAlert,
  ]);

  const [
    activeLayers,
    setActiveLayers,
  ] = useState<string[]>([ 'Active Fires', ]);

  useEffect(() => {
    console.log([ ...activeLayers, ]);
  }, [ activeLayers, ]);

  const activeAlerts = useWeatherAlerts(activeLayers);
  const activeFires = useActiveFires();
  const activeBoundaries = useActiveBoundaries(activeLayers);

  return <>
    {(typeof weatherData === 'undefined' || isLoading) && <LoadingSpinner />}
    {weatherData === null && <h2 className='text-center'>Failed to Load Weather Data</h2>}
    {weatherData && <>
      <Row>
        <Col lg={4}>
          <h2 className='text-center'>Readiness Level</h2>
          <Col xs={12} className='font-monospace text-center'>
            <table className={styles.table}><tbody>
              <tr>
                <td className='px-2'>National</td>
                <td className='px-2'>{weatherData.readiness.National}</td>
              </tr>
              <tr>
                <td className='px-2'>RM GACC</td>
                <td className='px-2'>{weatherData.readiness.RMA}</td>
              </tr>
            </tbody></table>
          </Col>
          <Col xs={12} className='font-monospace text-center'>{weatherData.updated}</Col>
          <h2 className='text-center mt-2'>Quick Links</h2>
          <ul>
            <li><a target='_blank' href='https://www.nifc.gov/nicc/sitreprt.pdf'>National Sitrep</a></li>
            <li><a target='_blank' href='https://gacc.nifc.gov/rmcc/intelligence.php'>RM GACC Intel</a></li>
            <li><a target='_blank' href='https://gacc.nifc.gov/rmcc/index.php'>RM GACC Homepage</a></li>
            <li><a target='_blank' href='https://inciweb.wildfire.gov/'>InciWeb</a></li>
            <li><a target='_blank' href='https://fs-prod-nwcg.s3.us-gov-west-1.amazonaws.com/s3fs-public/publication/pms461.pdf'>IRPG</a></li>
            <li><a target='_blank' href='https://www.weather.gov/fire/'>NWS Fire Weather</a></li>
          </ul>
          <Col className='d-flex flex-row flex-wrap justify-content-around'>
            {legendLayers.map((layer, idx) =>
              <div key={idx} className='p-3'>
                <h5>{ layer.layerName }</h5>
                <table>
                  <tbody>
                    {layer.legend.map((item, idx2) =>
                      <tr key={idx2}>
                        <td><img
                          src={item.imageData
                            ? `data:${item.contentType};base64,${item.imageData}`
                            : item.url}
                          alt={item.label}
                          width={item.width}
                          height={item.height}
                          style={{
                            backgroundColor: 'white',
                            opacity: item.opacity !== undefined ? item.opacity : 0.5,
                          }}
                        /></td>
                        <td>{ item.label }</td>
                      </tr>)}
                  </tbody>
                </table>
              </div>)}
          </Col>
        </Col>
        <Col lg={8} className='mt-3 mt-lg-0 mt-xl-0'>
          <MapContainer
            center={[
              39,
              -105.545167,
            ]}
            zoom={7}
            style={{
              height: '500px',
            }}
          >
            <MapLayerEvents setActiveLayers={setActiveLayers} />
            <TileLayer
              maxZoom={19}
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
            />
            {activeFires !== null && activeLayers.includes('Active Fires') && <GeoJSON
              data={activeFires}
              style={{
                color: 'red',
                weight: 2,
                fillOpacity: 0.1,
              }}
              pointToLayer={(feature: FireInfo) => FireMarker(feature)}
            />}
            {activeBoundaries !== null && activeLayers.includes('Active Fire Boundaries') && <GeoJSON
              data={activeBoundaries}
              style={{
                color: 'red',
                fillColor: 'red',
                fillOpacity: 0.2,
              }}
              onEachFeature={(feature: Feature, layer: Layer) => {
                layer.bindTooltip(`${feature.properties?.poly_IncidentName || 'Unknown Incident Name'}${feature.properties?.attr_CpxName ? `<br />${feature.properties?.attr_CpxName}` : ''}`, {
                  direction: 'center',
                });
              }}
            />}
            {activeAlerts !== null && activeLayers.includes('Weather Alerts') && <GeoJSON
              data={activeAlerts}
              style={{
                color: 'red',
                weight: 2,
                fillOpacity: 0.1,
              }}
              onEachFeature={(feature, layer) => {
                layer.bindPopup(`<b>${feature.properties?.event || 'Unknown Event'}</b><br />` +
                    `${feature.properties?.headline || ''}<br/><br />` +
                    `${(feature.properties?.description || '')
                      .replace(/([^\n])\n([^\n])/g, (a: string, b: string, c: string) => `${b} ${c}`)
                      .replace(/\n/g, '<br />')
                    }<br /><br />`);
                layer.bindTooltip(feature.properties?.event || 'N/A', {
                  direction: 'center',
                });
              }}
            />}

            <LayersControl position='topright'>
              <LayersControl.Overlay
                checked
                key='active'
                name='Active Fires'>
                <GeoJSON
                  data={{
                    type: 'FeatureCollection',
                    features: [],
                  } as FeatureCollection}
                />
              </LayersControl.Overlay>
              <LayersControl.Overlay
                key='active-boundary'
                name='Active Fire Boundaries'>
                <GeoJSON
                  data={{
                    type: 'FeatureCollection',
                    features: [],
                  } as FeatureCollection}
                />
              </LayersControl.Overlay>
              <LayersControl.Overlay
                key='old-fires'
                name='Old Fires (Last 7 Days)'>
                <FeatureLayer
                  url='https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/WFIGS_Incident_Locations/FeatureServer/0'
                  where='ControlDateTime >= CURRENT_TIMESTAMP - 7 OR ContainmentDateTime >= CURRENT_TIMESTAMP - 7 OR FireOutDateTime >= CURRENT_TIMESTAMP - 7 OR ModifiedOnDateTime_dt BETWEEN CURRENT_TIMESTAMP - 7 AND CURRENT_TIMESTAMP - 2'
                  pointToLayer={(feature: FireInfo) => FireMarker(feature)}
                  fields={[
                    'ContainmentDateTime',
                    'ControlDateTime',
                    'CpxName',
                    'DiscoveryAcres',
                    'EstimatedCostToDate',
                    'EstimatedFinalCost',
                    'FinalAcres',
                    'FireBehaviorGeneral',
                    'FireBehaviorGeneral1',
                    'FireBehaviorGeneral2',
                    'FireBehaviorGeneral3',
                    'FireCause',
                    'FireCauseGeneral',
                    'FireCauseSpecific',
                    'FireDiscoveryDateTime',
                    'FireOutDateTime',
                    'FireStrategyConfinePercent',
                    'FireStrategyFullSuppPercent',
                    'FireStrategyMonitorPercent',
                    'FireStrategyPointZonePercent',
                    'IncidentComplexityLevel',
                    'IncidentManagementOrganization',
                    'IncidentName',
                    'IncidentSize',
                    'IncidentTypeCategory',
                    'ModifiedOnDateTime_dt',
                    'OBJECTID',
                    'OrganizationalAssessment',
                    'PercentContained',
                    'PredominantFuelGroup',
                    'PredominantFuelModel',
                    'PrimaryFuelModel',
                    'SecondaryFuelModel',
                    'TotalIncidentPersonnel',
                  ]}
                />
              </LayersControl.Overlay>
              <LayersControl.Overlay
                key='fireoutlook-1'
                checked
                name='Day 1 Fire Outlook'>
                <DynamicMapLayer
                  url='https://fsapps.nwcg.gov/psp/rest/services/npsg/outlooks_forecast/MapServer/'
                  transparent={true}
                  layers={[ 0, ]}
                  opacity={0.5}
                />
              </LayersControl.Overlay>
              <LayersControl.Overlay
                key='fireoutlook-2'
                name='Day 2 Fire Outlook'>
                <DynamicMapLayer
                  url='https://fsapps.nwcg.gov/psp/rest/services/npsg/outlooks_forecast/MapServer/'
                  transparent={true}
                  layers={[ 1, ]}
                  opacity={0.5}
                />
              </LayersControl.Overlay>
              <LayersControl.Overlay
                key='fireoutlook-3'
                name='Day 3 Fire Outlook'>
                <DynamicMapLayer
                  url='https://fsapps.nwcg.gov/psp/rest/services/npsg/outlooks_forecast/MapServer/'
                  transparent={true}
                  layers={[ 2, ]}
                  opacity={0.5}
                />
              </LayersControl.Overlay>
              <LayersControl.Overlay
                key='fireoutlook-4'
                name='Day 4 Fire Outlook'>
                <DynamicMapLayer
                  url='https://fsapps.nwcg.gov/psp/rest/services/npsg/outlooks_forecast/MapServer/'
                  transparent={true}
                  layers={[ 3, ]}
                  opacity={0.5}
                />
              </LayersControl.Overlay>
              <LayersControl.Overlay
                key='fireoutlook-5'
                name='Day 5 Fire Outlook'>
                <DynamicMapLayer
                  url='https://fsapps.nwcg.gov/psp/rest/services/npsg/outlooks_forecast/MapServer/'
                  transparent={true}
                  layers={[ 4, ]}
                  opacity={0.5}
                />
              </LayersControl.Overlay>
              <LayersControl.Overlay
                key='fireoutlook-6'
                name='Day 6 Fire Outlook'>
                <DynamicMapLayer
                  url='https://fsapps.nwcg.gov/psp/rest/services/npsg/outlooks_forecast/MapServer/'
                  transparent={true}
                  layers={[ 5, ]}
                  opacity={0.5}
                />
              </LayersControl.Overlay>
              <LayersControl.Overlay
                key='fireoutlook-7'
                name='Day 7 Fire Outlook'>
                <DynamicMapLayer
                  url='https://fsapps.nwcg.gov/psp/rest/services/npsg/outlooks_forecast/MapServer/'
                  transparent={true}
                  layers={[ 6, ]}
                  opacity={0.5}
                />
              </LayersControl.Overlay>
              <LayersControl.Overlay
                key='fireweather-1'
                name='Day 1 Fire Weather'>
                <DynamicMapLayer
                  url='https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer/'
                  transparent={true}
                  layers={[ 0, ]}
                  opacity={0.5}
                />
              </LayersControl.Overlay>
              <LayersControl.Overlay
                key='fireweather-2'
                name='Day 2 Fire Weather'>
                <DynamicMapLayer
                  url='https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer/'
                  transparent={true}
                  layers={[ 3, ]}
                  opacity={0.5}
                />
              </LayersControl.Overlay>
              <LayersControl.Overlay
                key='fireweather-3'
                name='Day 3 Fire Weather'>
                <DynamicMapLayer
                  url='https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer/'
                  transparent={true}
                  layers={[ 6, ]}
                  opacity={0.5}
                />
              </LayersControl.Overlay>
              <LayersControl.Overlay
                key='fireweather-4'
                name='Day 4 Fire Weather'>
                <DynamicMapLayer
                  url='https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer/'
                  transparent={true}
                  layers={[ 9, ]}
                  opacity={0.5}
                />
              </LayersControl.Overlay>
              <LayersControl.Overlay
                key='fireweather-5'
                name='Day 5 Fire Weather'>
                <DynamicMapLayer
                  url='https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer/'
                  transparent={true}
                  layers={[ 12, ]}
                  opacity={0.5}
                />
              </LayersControl.Overlay>
              <LayersControl.Overlay
                key='fireweather-6'
                name='Day 6 Fire Weather'>
                <DynamicMapLayer
                  url='https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer/'
                  transparent={true}
                  layers={[ 15, ]}
                  opacity={0.5}
                />
              </LayersControl.Overlay>
              <LayersControl.Overlay
                key='fireweather-7'
                name='Day 7 Fire Weather'>
                <DynamicMapLayer
                  url='https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer/'
                  transparent={true}
                  layers={[ 18, ]}
                  opacity={0.5}
                />
              </LayersControl.Overlay>
              <LayersControl.Overlay
                key='fireweather-8'
                name='Day 8 Fire Weather'>
                <DynamicMapLayer
                  url='https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer/'
                  transparent={true}
                  layers={[ 21, ]}
                  opacity={0.5}
                />
              </LayersControl.Overlay>
              <LayersControl.Overlay
                key='weather'
                name='Weather Alerts'
              >
                <GeoJSON
                  data={{
                    type: 'FeatureCollection',
                    features: [],
                  } as FeatureCollection}
                />
              </LayersControl.Overlay>
              <LayersControl.Overlay
                key='dispatch-boundaries'
                name='Fire Dispatch Boundaries'>
                <CorrectedFeatureLayer
                  url='https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/DMP_National_Dispatch_Boundaries_Public/FeatureServer/0'
                  transparent={true}
                  opacity={0.5}
                  style={{
                    fillOpacity: 0.001,
                  }}
                  onEachFeature={(feature: Feature, layer: Layer) => {
                    layer.bindPopup(`<b>${feature.properties?.DispName || 'Unknown Dispatch Name'}</b><br />` +
                    `Disp Loc: ${feature.properties?.DispLocation || 'Unknown'}<br />`);
                    layer.bindTooltip(feature.properties?.DispName || 'Unknown Dispatch Name', {
                      direction: 'center',
                    });
                  }}
                />
              </LayersControl.Overlay>
            </LayersControl>
          </MapContainer>
        </Col>
      </Row>
      <Row className='mt-4'>
        <iframe src='https://www.google.com/maps/d/embed?mid=1cEAhNHqp82AXABF8qU7k6sRFI4392V0e&ehbc=2E312F' width='640' height='480'></iframe>
      </Row>
    </>}
  </>;
}
