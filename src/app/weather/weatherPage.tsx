'use client';

import { FeatureCollection } from 'geojson';
import L from 'leaflet';
import {
  useContext, useEffect, useState
} from 'react';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';
import {
  GeoJSON, GeoJSONProps, LayersControl, MapContainer, TileLayer
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
  return marker;
}

function isSaguacheFire(fire: FireInfo): boolean {
  return fire.properties.POOCounty === 'Saguache';
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

interface GeoJsonFromUrlProps extends Partial<GeoJSONProps> {
  url: string;
  name: string;
  showByDefault?: boolean;
}

function GeoJsonFromUrl({
  url,
  name,
  showByDefault = true,
  ...props
}: Readonly<GeoJsonFromUrlProps>) {
  const [
    geoJsonData,
    setGeoJsonData,
  ] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    (async () => {
      const result = await fetch(url)
        .then(r => r.json()) as FeatureCollection;
      setGeoJsonData(result);
    })();
  }, [ url, ]);

  if (geoJsonData === null) {
    return <></>;
  }

  return <LayersControl.Overlay
    name={name}
    checked={showByDefault}
  >
    <GeoJSON
      data={geoJsonData}
      {...props}
    />
  </LayersControl.Overlay>;
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
        <Col xs={12} className='font-monospace text-center'>{weatherData.updated}</Col>

        <Col md={6}>
          <h2 className='text-center'>Readiness Level</h2>
          <Col xs={12} className='font-monospace text-center'>
            <table className={styles.table}><tbody>
              <tr>
                <td className='px-2'>National</td>
                <td className='px-2'>{weatherData.readiness.National}</td>
                <td className='px-2'><a href='https://www.nifc.gov/nicc/sitreprt.pdf'>National Sitrep</a></td>
              </tr>
              <tr>
                <td className='px-2'>RM GACC</td>
                <td className='px-2'>{weatherData.readiness.RMA}</td>
                <td className='px-2'><a href='https://gacc.nifc.gov/rmcc/intelligence.php'>RM GACC Intel</a></td>
              </tr>
            </tbody></table>
          </Col>
        </Col>

        <Col md={6}>
          <h2 className='text-center'>Active Fires</h2>
          <Col xs={12} className='font-monospace text-center'>
            <table className={styles.table}>
              <thead><tr>
                <th className='px-2'>Type</th>
                <th className='px-2'>Saguache</th>
                <th className='px-2'>Colorado</th>
              </tr></thead>
              <tbody>
                {weatherData.stateFires.fires === -1
                  ? <tr><td colSpan={3}>Current Fire Data Unavailable</td></tr>
                  : <>
                    <tr>
                      <th className='px-2'>New</th>
                      <td className='px-2'>
                        {weatherData.stateFires.fires
                          .filter(isSaguacheFire)
                          .filter(isFireActive)
                          .filter(f => getFireType(f) === 'new')
                          .length} of {weatherData.stateFires.fires
                          .filter(isSaguacheFire)
                          .filter(f => getFireType(f) === 'new')
                          .length}
                      </td>
                      <td className='px-2'>
                        {weatherData.stateFires.fires
                          .filter(isFireActive)
                          .filter(f => getFireType(f) === 'new')
                          .length} of {weatherData.stateFires.fires
                          .filter(f => getFireType(f) === 'new')
                          .length}
                      </td>
                    </tr>
                    <tr>
                      <th className='px-2'>Ongoing</th>
                      <td className='px-2'>
                        {weatherData.stateFires.fires
                          .filter(isSaguacheFire)
                          .filter(isFireActive)
                          .filter(f => getFireType(f) === 'ongoing')
                          .length} of {weatherData.stateFires.fires
                          .filter(isSaguacheFire)
                          .filter(f => getFireType(f) === 'ongoing')
                          .length}
                      </td>
                      <td className='px-2'>
                        {weatherData.stateFires.fires
                          .filter(isFireActive)
                          .filter(f => getFireType(f) === 'ongoing')
                          .length} of {weatherData.stateFires.fires
                          .filter(f => getFireType(f) === 'ongoing')
                          .length}
                      </td>
                    </tr>
                    <tr>
                      <th className='px-2'>RX</th>
                      <td className='px-2'>
                        {weatherData.stateFires.fires
                          .filter(isSaguacheFire)
                          .filter(isFireActive)
                          .filter(f => getFireType(f) === 'rx')
                          .length} of {weatherData.stateFires.fires
                          .filter(isSaguacheFire)
                          .filter(f => getFireType(f) === 'rx')
                          .length}
                      </td>
                      <td className='px-2'>
                        {weatherData.stateFires.fires
                          .filter(isFireActive)
                          .filter(f => getFireType(f) === 'rx')
                          .length} of {weatherData.stateFires.fires
                          .filter(f => getFireType(f) === 'rx')
                          .length}
                      </td>
                    </tr>
                  </>}
              </tbody>
            </table>
          </Col>
          <Col xs={12} className='font-monospace'><a href='https://gacc.nifc.gov/rmcc/'>RM GACC Incident Map</a></Col>
          <Col xs={12} className='font-monospace'><a href='https://inciweb.nwcg.gov/'>InciWeb - National Incident Map</a></Col>
        </Col>
      </Row>
      <Row className='mt-3'>
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
            {activeAlerts !== null && <LayersControl.Overlay
              checked
              name='Weather Alerts'
            >
              <GeoJSON
                data={activeAlerts}
                style={feature => {
                  console.log(feature);
                  return {
                    color: 'red',
                    weight: 2,
                    fillOpacity: 0.1,
                  };
                }}
                onEachFeature={(feature, layer) => {
                  layer.bindPopup(`<b>${feature.properties?.event || 'Unknown Event'}</b><br />` +
                    `${feature.properties?.headline || ''}<br/><br />` +
                    `${(feature.properties?.description || '')
                      .replace(/([^\n])\n([^\n])/g, (a: string, b: string, c: string) => `${b} ${c}`)
                      .replace(/\n/g, '<br />')
                    }<br /><br />`);
                  layer.bindTooltip(feature.properties?.event || 'N/A');
                }}
              />
            </LayersControl.Overlay>}
            <GeoJsonFromUrl
              url='https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/DMP_National_Dispatch_Boundaries_Public/FeatureServer/0/query?where=GACCName+%3D+%27Rocky+Mountain+Area+Coordination+Center%27&geometry=%7B%22xmin%22%3A-109.0%2C%22ymin%22%3A38.0%2C%22xmax%22%3A-103.0%2C%22ymax%22%3A40.0%2C%22spatialReference%22%3A%7B%22wkid%22%3A4326%7D%7D&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelEnvelopeIntersects&outFields=*&returnGeometry=true&f=pgeojson'
              name='Dispatch Boundaries'
              showByDefault={false}
              style={{
                color: 'blue',
                weight: 2,
                fillOpacity: 0.05,
              }}
              onEachFeature={(feature, layer) => {
                layer.bindPopup(`<b>${feature.properties?.DispName || 'Unknown Dispatch Name'}</b><br />` +
                  `Disp Loc: ${feature.properties?.DispLocation || 'Unknown'}<br />`);
              }}
            />
            <GeoJsonFromUrl
              name='Active Fires'
              url='https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/WFIGS_Incident_Locations/FeatureServer/0/query?where=ModifiedOnDateTime_dt+BETWEEN+CURRENT_TIMESTAMP+-+3+AND+CURRENT_TIMESTAMP&geometry=%7B%22xmin%22%3A-109.0496%2C%22ymin%22%3A37.0%2C%22xmax%22%3A-102.0421%2C%22ymax%22%3A41.0%2C%22spatialReference%22%3A%7B%22wkid%22%3A4326%7D%7D&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelEnvelopeIntersects&outFields=*&returnGeometry=true&f=pgeojson'
              pointToLayer={feature => FireMarker(feature as unknown as FireInfo)}
            />
          </LayersControl>
        </MapContainer>
      </Row>
      <Row>
        <iframe src='https://www.google.com/maps/d/embed?mid=1cEAhNHqp82AXABF8qU7k6sRFI4392V0e&ehbc=2E312F' width='640' height='480'></iframe>
      </Row>
    </>}
  </>;
}
