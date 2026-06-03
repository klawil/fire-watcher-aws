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
  GeoJSON, LayersControl, MapContainer, TileLayer
} from 'react-leaflet';

import styles from './weather.module.css';

import LoadingSpinner from '@/components/loadingSpinner/loadingSpinner';
import {
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
  let popupContent = `<b>${fire.properties.IncidentName}</b><br /><br />`;
  if (fire.properties.FireDiscoveryDateTime) {
    popupContent += `Discovered: ${dateTimeToTimeStr(fire.properties.FireDiscoveryDateTime)}<br />`;
  }
  if (fire.properties.ContainmentDateTime) {
    popupContent += `Contained: ${dateTimeToTimeStr(fire.properties.ContainmentDateTime)}<br />`;
  }
  if (fire.properties.ControlDateTime) {
    popupContent += `Controlled: ${dateTimeToTimeStr(fire.properties.ControlDateTime)}<br />`;
  }
  if (fire.properties.FireOutDateTime) {
    popupContent += `Fire Out: ${dateTimeToTimeStr(fire.properties.FireOutDateTime)}<br />`;
  }
  if (fire.properties.ModifiedOnDateTime_dt) {
    popupContent += `Updated: ${dateTimeToTimeStr(fire.properties.ModifiedOnDateTime_dt)}<br />`;
  }
  if (start || current || final) {
    popupContent += '<br />';
  }
  if (start) {
    popupContent += `Initial Size: ${start}ac<br />`;
  }
  if (current) {
    popupContent += `${isFireActive(fire) ? 'Current' : 'Final'} Size: ${current}ac<br />`;
  }
  if (final) {
    popupContent += `Final Size: ${final}ac<br />`;
  }
  if (fire.properties.PercentContained !== null) {
    popupContent += `<br />Percent Contained: ${fire.properties.PercentContained}%`;
  }
  marker.bindPopup(popupContent);

  marker.bindTooltip(fire.properties?.IncidentName || 'Unknown Incident Name', {
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

function useWeatherAlerts(): FeatureCollection | null {
  const [
    alertsGeoJson,
    setAlertsGeoJson,
  ] = useState<FeatureCollection | null>(null);

  useEffect(() => {
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
  }, []);

  return alertsGeoJson;
}

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

  const activeAlerts = useWeatherAlerts();

  useEffect(() => {
    console.log(activeAlerts);
  }, [ activeAlerts, ]);

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
            <TileLayer
              maxZoom={19}
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
            />
            <LayersControl position='topright'>
              <LayersControl.Overlay
                name='Day 1 Fire Outlook'
              >
                <DynamicMapLayer
                  url='https://fsapps.nwcg.gov/psp/rest/services/npsg/outlooks_forecast/MapServer/'
                  transparent={true}
                  layers={[ 0, ]}
                  opacity={0.25}
                />
              </LayersControl.Overlay>
              <LayersControl.Overlay
                name='Day 2 Fire Outlook'
              >
                <DynamicMapLayer
                  url='https://fsapps.nwcg.gov/psp/rest/services/npsg/outlooks_forecast/MapServer/'
                  transparent={true}
                  layers={[ 1, ]}
                  opacity={0.25}
                />
              </LayersControl.Overlay>
              <LayersControl.Overlay
                name='Day 1 Fire Weather'>
                <DynamicMapLayer
                  url='https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer/'
                  transparent={true}
                  layers={[ 0, ]}
                  opacity={0.25}
                />
              </LayersControl.Overlay>
              <LayersControl.Overlay
                name='Day 2 Fire Weather'>
                <DynamicMapLayer
                  url='https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer/'
                  transparent={true}
                  layers={[ 3, ]}
                  opacity={0.25}
                />
              </LayersControl.Overlay>
              {activeAlerts !== null && <LayersControl.Overlay
                checked
                name='Weather Alerts'
              >
                <GeoJSON
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
                />
              </LayersControl.Overlay>}
              <LayersControl.Overlay
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
              <LayersControl.Overlay
                checked
                name='Active Fires'>
                <FeatureLayer
                  url='https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/WFIGS_Incident_Locations/FeatureServer/0'
                  where='ContainmentDateTime >= CURRENT_TIMESTAMP - 2 OR ControlDateTime >= CURRENT_TIMESTAMP - 2 OR FireOutDateTime >= CURRENT_TIMESTAMP - 2 OR FireDiscoveryDateTime >= CURRENT_TIMESTAMP - 2 OR ModifiedOnDateTime_dt >= CURRENT_TIMESTAMP - 2'
                  pointToLayer={(feature: FireInfo) => FireMarker(feature)}
                />
              </LayersControl.Overlay>
              <LayersControl.Overlay
                name='Active Fire Boundaries'>
                <CorrectedFeatureLayer
                  url='https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0'
                  where='attr_ContainmentDateTime >= CURRENT_TIMESTAMP - 2 OR attr_ControlDateTime >= CURRENT_TIMESTAMP - 2 OR attr_FireOutDateTime >= CURRENT_TIMESTAMP - 2 OR attr_FireDiscoveryDateTime >= CURRENT_TIMESTAMP - 2 OR attr_ModifiedOnDateTime_dt >= CURRENT_TIMESTAMP - 2 OR poly_PolygonDateTime >= CURRENT_TIMESTAMP - 2'
                  style={{
                    color: 'red',
                    fillColor: 'red',
                    fillOpacity: 0.2,
                  }}
                  onEachFeature={(feature: Feature, layer: Layer) => {
                    layer.bindTooltip(feature.properties?.poly_IncidentName || 'Unknown Incident Name', {
                      direction: 'center',
                    });
                  }}
                // pointToLayer={(feature: FireInfo) => FireMarker(feature)}
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
