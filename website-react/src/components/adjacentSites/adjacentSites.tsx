'use client';

import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import Button from "react-bootstrap/Button";
import Spinner from "react-bootstrap/Spinner";
import Table from "react-bootstrap/Table";
import { Circle, MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import styles from "./adjacentSites.module.css";
import "leaflet/dist/leaflet.css";
import { ApiFrontendSitesResponse, SeenByRecorderKeys, SiteObject } from "$/frontendApi";
import { useCallback, useEffect, useState } from "react";
import LoadingSpinner from "../loadingSpinner/loadingSpinner";
import L from 'leaflet';

const fadeSiteTime = 1000 * 60 * 15; // 15 minutes
const localeTimeOptions: Intl.DateTimeFormatOptions = {
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hour12: false
};

const makeSiteStringFn = (keysAndNames: {
	[key in SeenByRecorderKeys]?: string;
}) => (site: SiteObject) => {
	const flags: string[] = [];
	(Object.keys(keysAndNames) as (keyof typeof keysAndNames)[]).forEach((key) => {
		const siteData = site[key];
		if (typeof siteData === 'undefined') return;
		let flagStr = keysAndNames[key] as string;
		const numTrue = Object.keys(siteData).filter(seen => siteData[seen]).length;
		if (numTrue !== Object.keys(siteData).length)
			flagStr += '?';
		if (numTrue > 0)
			flags.push(flagStr);
	});
	return flags.join(', ');
}
const makeSiteFlags = makeSiteStringFn({
	'ActiveConn': 'Active Conn',
	'ConvChannel': 'Conv Channels',
	'ValidInfo': 'Valid Info',
	'CompositeCtrl': 'Composite Ctrl',
	'NoServReq': 'No Serv Req',
	'BackupCtrl': 'Backup Ctrl',
});
const makeSiteServices = makeSiteStringFn({
	'SupportData': 'Data',
	'SupportVoice': 'Voice',
	'SupportReg': 'Registration',
	'SupportAuth': 'Auth'
});

function SiteMapMarker({
  site,
  minUpdateTime,
}: Readonly<{
  site: SiteObject;
  minUpdateTime: number;
}>) {
  if (typeof site.SiteLat === 'undefined' || typeof site.SiteLon === 'undefined') return (<></>);

  const siteUpdateTime = Math.max.apply(null, Object.keys(site.UpdateTime || {}).map(key => (site.UpdateTime?.[key] || 0) * 1000));
  const markerOpacity = Date.now() - siteUpdateTime >= fadeSiteTime ? 0.5 : 1;
  const siteFailed = Object.keys(site.SiteFailed || {}).filter(key => site.SiteFailed?.[key]).length > 0;
  const seenBy = Object.keys(site.UpdateTime || {}).filter(key => (site.UpdateTime?.[key] || 0) >= minUpdateTime).sort().join(', ');
  const updateTime = new Date(Math.max.apply(null, Object.keys(site.UpdateTime || {}).map(key => (site.UpdateTime?.[key] || 0) * 1000)))
    .toLocaleTimeString('en-US', localeTimeOptions);

  return (<>
    <Marker
      opacity={markerOpacity}
      position={[ site.SiteLat, site.SiteLon ]}
      icon={L.icon({
        iconUrl: `/icons/${siteFailed ? 'red' : 'black'}.png`,
        iconSize: [ 32, 32 ],
        iconAnchor: [ 16, 32 ],
        popupAnchor: [ 0, -32 ],
      })}
    >
      <Popup><b>{site.SiteName}</b><br />Failed: {siteFailed ? 'FAILED' : 'N'}<br />Seen By: {seenBy}<br />Updated: {updateTime}</Popup>
    </Marker>

    {site.SiteRng && <Circle
      center={[ site.SiteLat, site.SiteLon ]}
      radius={site.SiteRng * 1609.34}
      opacity={0.2}
      fillOpacity={0.05}
      color={siteFailed ? '#ff5733' : '#3388ff'}
    />}
  </>);
}

export default function AdjacentSites() {
  const [sites, setSites] = useState<SiteObject[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const updateSites = useCallback(async () => {
    if (isLoading) return;

    setIsLoading(true);
    try {
      const siteData: ApiFrontendSitesResponse = await fetch(`/api/frontend?action=sites`)
        .then(r => r.json());

      if (!siteData.success) throw siteData;

      setSites(siteData.data);
    } catch (e) {
      console.error(`Failed to get site data`, e);
    }
    setIsLoading(false);
  }, [isLoading]);
  useEffect(() => {
    if (sites.length === 0) {
      updateSites();
    }
  }, [sites, updateSites]);
   
	const minUpdateTime = Math.floor(Date.now() / 1000) - (60 * 15);

  return (<>
    <h3 className="text-center">Adjacent Sites (Updates Every 5m)</h3>

    <Row className="justify-content-center"><Col md={6}>
      <MapContainer
        className={styles.map}
        center={[ 37.749, -106.073]}
        zoom={8}
      >
        <TileLayer
          maxZoom={19}
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {sites
          .filter(site => typeof site.UpdateTime !== 'undefined' && typeof site.SiteFailed !== 'undefined')
          .filter(site => typeof site.SiteLat !== 'undefined' && typeof site.SiteLon !== 'undefined')
          .map(site => <SiteMapMarker
            key={site.SiteId}
            site={site}
            minUpdateTime={minUpdateTime}
          />)}
      </MapContainer>
    </Col></Row>

    <Row className="m-3 justify-content-center"><Col className="d-grid" md={6}>
      <Button
        variant="info"
        onClick={updateSites}
        disabled={isLoading}
      >{isLoading && <Spinner size="sm" />} Update</Button>
    </Col></Row>

    {sites.length > 0 && <Table striped>
      <thead><tr className="text-center">
        <th>Site</th>
        <th>Name</th>
        <th>County</th>
        <th>Failed</th>
        <th>Flags</th>
        <th>Services</th>
        <th>Seen By</th>
        <th>Updated</th>
      </tr></thead>
      <tbody className="font-monospace">{sites
        .filter(site => typeof site.UpdateTime !== 'undefined' && typeof site.SiteFailed !== 'undefined')
        .sort((a, b) => a.SiteId > b.SiteId ? 1 : -1)
        .map(site => <tr key={site.SiteId}>
          <td>{site.SiteId}</td>
          <td>{site.SiteName || 'N/A'}</td>
          <td className="text-end">{site.SiteCounty || 'N/A'}</td>
          <td className="text-center">{Object.keys(site.SiteFailed || {}).filter(key => site.SiteFailed?.[key]).length > 0 ? 'FAILED' : 'N'}</td>
          <td className="text-center">{makeSiteFlags(site)}</td>
          <td className="text-center">{makeSiteServices(site)}</td>
          <td className="text-center">{Object.keys(site.UpdateTime || {}).filter(key => (site.UpdateTime?.[key] || 0) >= minUpdateTime).sort().join(', ')}</td>
          <td className="text-center">{
            new Date(Math.max.apply(null, Object.keys(site.UpdateTime || {}).map(key => (site.UpdateTime?.[key] || 0) * 1000)))
              .toLocaleTimeString('en-US', localeTimeOptions)
          }</td>
        </tr>)
      }</tbody>
    </Table>}
    {sites.length === 0 && <LoadingSpinner />}
  </>);
}
