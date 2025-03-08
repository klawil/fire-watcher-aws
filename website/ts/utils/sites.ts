import { ApiFrontendSitesResponse, SeenByRecorderKeys, SiteObject } from "../../../common/frontendApi";
import { showAlert } from "./alerts";
import { createTableRow } from "./table";
import * as leaflet from 'leaflet';

declare global {
	interface Window {
		L: leaflet.Class;
	}
}

const siteMarkers: {
	[key: string]: leaflet.Marker;
} = {};
const siteCircles: {
	[key: string]: leaflet.Circle;
} = {};
const siteUpdateTime: {
	[key: string]: number;
} = {};
const fadeSiteTime = 1000 * 60 * 15; // 15 minutes
const localeTimeOptions: Intl.DateTimeFormatOptions = {
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hour12: false
};

const siteTable = <HTMLTableElement>document.getElementById('adjacent-sites');

const makeSiteStringFn = (keysAndNames: {
	[key in SeenByRecorderKeys]?: string;
}) => (site: SiteObject) => {
	let flags: string[] = [];
	(<SeenByRecorderKeys[]>Object.keys(keysAndNames)).forEach((key) => {
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

const siteLiveIcon: leaflet.IconOptions = {
	iconUrl: `/libs/images/black.png`,
	iconSize: [ 32, 32 ],
	iconAnchor: [ 16, 32 ],
	popupAnchor: [ 0, -32 ],
};
const siteFailedIcon: leaflet.IconOptions = {
	iconUrl: `/libs/images/red.png`,
	iconSize: [ 32, 32 ],
	iconAnchor: [ 16, 32 ],
	popupAnchor: [ 0, -32 ],
};

const circleLiveColor = '#3388ff';
const circleFailedColor = '#ff5733';

let map: leaflet.Map | null = null;
export async function buildMap(divId: string) {
	map = window.L.map(divId).setView([ 37.749, -106.073 ], 8);
	window.L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
		maxZoom: 19,
		attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
	}).addTo(map);
}

function sortSiteTable() {
	const rowIds = Array.from(siteTable.querySelectorAll('tr'))
		.map(row => row.id);

	const rowIdsSorted = [ ...rowIds ].sort();

	if (JSON.stringify(rowIdsSorted) !== JSON.stringify(rowIds)) {
		rowIdsSorted.forEach(rowId => siteTable.appendChild(<HTMLTableRowElement>document.getElementById(rowId)));
	}
}

export async function updateSitesTable() {
	try {
		const siteData: ApiFrontendSitesResponse = await fetch(`/api/frontend?action=sites`)
			.then(r => r.json());

		if (!siteData.success) {
			console.error(siteData);
			throw new Error('Failed to load DTR site data');
		}

		siteData.data.forEach(site => {
			const siteUpdate = site.UpdateTime;
			const siteFailed = site.SiteFailed;
			if (
				typeof siteUpdate === 'undefined' ||
				typeof siteFailed === 'undefined'
			) return;
			const minUpdateTime = Math.floor(Date.now() / 1000) - (60 * 15);
			siteUpdateTime[site.SiteId] = Math.max.apply(null, Object.keys(siteUpdate).map(key => siteUpdate[key] * 1000));
			let newData: {
				[key: string]: string;
			} = {
				failed: Object.keys(siteFailed).filter(key => siteFailed[key]).length > 0 ? 'FAILED' : 'N',
				seen: Object.keys(siteUpdate).filter(key => siteUpdate[key] >= minUpdateTime).sort().join(', '),
				updated: new Date(siteUpdateTime[site.SiteId]).toLocaleTimeString('en-US', localeTimeOptions),
				flags: makeSiteFlags(site),
				services: makeSiteServices(site),
			};
			if (document.getElementById(`site-${site.SiteId}`) === null) {
				createTableRow(siteTable, {
					id: `site-${site.SiteId}`,
					columns: [
						{
							html: site.SiteId,
						},
						{
							html: site.SiteName || 'N/A',
						},
						{
							classList: [ 'text-end' ],
							html: site.SiteCounty || 'N/A',
						},
						{
							classList: [ 'text-center' ],
							id: `site-${site.SiteId}-failed`,
							html: newData.failed,
						},
						{
							classList: [ 'text-center' ],
							id: `site-${site.SiteId}-flags`,
							html: newData.flags,
						},
						{
							classList: [ 'text-center' ],
							id: `site-${site.SiteId}-services`,
							html: newData.services,
						},
						{
							classList: [ 'text-center' ],
							id: `site-${site.SiteId}-seen`,
							html: newData.seen,
						},
						{
							classList: [ 'text-center' ],
							id: `site-${site.SiteId}-updated`,
							html: newData.updated,
						},
					]
				})
			} else {
				Object.keys(newData).forEach(key => {
					const elem = document.getElementById(`site-${site.SiteId}-${key}`);
					if (elem !== null && elem.innerHTML !== newData[key])
						elem.innerHTML = newData[key];
				});
			}

			// Build the markers if needed
			if (
				map !== null &&
				typeof site.SiteLat !== 'undefined' &&
				typeof site.SiteLon !== 'undefined'
			) {
				const markerOpacity = Date.now() - siteUpdateTime[site.SiteId] >= fadeSiteTime ? 0.5 : 1;
				const popupContent = `<b>${site.SiteName}</b><br>Failed: ${newData.failed}<br>Seen By: ${newData.seen}<br>Updated: ${newData.updated}`;
				const icon: leaflet.Icon = window.L.icon(newData.failed === 'FAILED' ? siteFailedIcon : siteLiveIcon);
				if (typeof siteMarkers[site.SiteId] === 'undefined') {
					siteMarkers[site.SiteId] = window.L.marker([ site.SiteLat, site.SiteLon ], {
						icon,
					})
						.bindPopup('')
						.addTo(map);

					if (site.SiteRng) {
						siteCircles[site.SiteId] = window.L
							.circle([ site.SiteLat, site.SiteLon ], {
								weight: 2,
								opacity: 0.2,
								fillOpacity: 0.05,
								radius: site.SiteRng * 1609.34,
							})
							.addTo(map);
					}
				}

				siteMarkers[site.SiteId].getPopup()?.setContent(popupContent);
				siteMarkers[site.SiteId].setIcon(icon);
				siteMarkers[site.SiteId].setOpacity(markerOpacity);
				if (siteCircles[site.SiteId]) {
					siteCircles[site.SiteId].setStyle({
						color: newData.failed === 'FAILED' ? circleFailedColor : circleLiveColor,
					});
				}
			}
		});
		updateUpdateTime();
		sortSiteTable();
	} catch (e) {
		console.error(e);
		showAlert('danger', 'Failed to update site table');
	}

	setTimeout(updateSitesTable, 30000);
}

function updateUpdateTime() {
	const nowTime = Date.now();

	Object.keys(siteUpdateTime).forEach(key => {
		const timeElem = document.getElementById(`site-${key}-updated`);
		if (timeElem === null) return;

		// 00d 00h00m00s
		let timeDelta = Math.round((nowTime - siteUpdateTime[key]) / 1000);
		const periodValues: number[] = [
			24 * 60 * 60,
			60 * 60,
			60,
			1,
		];
		const periodLabels: string[] = [ 'd', 'h', 'm', 's', ];
		let hasHadValue = false;
		const newHtml = periodValues.map((v, i) => {
			if (timeDelta < v && !hasHadValue) return '';
			else if (timeDelta < v) return `00${periodLabels[i]}`;
			hasHadValue = true;

			let count = Math.floor(timeDelta / v);
			timeDelta = timeDelta - (count * v);
			return count.toString().padStart(2, '0') + periodLabels[i];
		}).join('');

		if (timeElem.innerHTML !== newHtml)
			timeElem.innerHTML = newHtml;
	});
}
setInterval(updateUpdateTime, 100);
