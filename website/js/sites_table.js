const siteMarkers = {};
const siteUpdateTime = {};
const fadeSiteTime = 1000 * 60 * 15; // 15 minutes out of date

const makeSiteString = (keysAndNames) => (site) => {
	let flags = [];
	Object.keys(keysAndNames).forEach(key => {
		let flagStr = keysAndNames[key];
		if (site[key])
			flags.push(flagStr);
	});

	return flags.join(', ');
};
const makeSiteFlags = makeSiteString({
	'ActiveConn': 'Active Conn',
	'ConvChannel': 'Conv Channels',
	'ValidInfo': 'Valid Info',
	'CompositeCtrl': 'Composite Ctrl',
	'NoServReq': 'No Serv Req',
	'BackupCtrl': 'Backup Ctrl',
});
const makeSiteServices = makeSiteString({
	'SupportData': 'Data',
	'SupportVoice': 'Voice',
	'SupportReg': 'Registration',
	'SupportAuth': 'Auth'
});
const siteTable = document.getElementById('adjacent-sites');
const localeTimeOptions = {
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hour12: false
};
function sortAdjacentTable() {
	const rowIds = [ ...siteTable.querySelectorAll('tr') ]
		.map(row => row.id);
	
	const rowIdsSorted = [ ...rowIds ].sort();
	
	if (JSON.stringify(rowIdsSorted) !== JSON.stringify(rowIds)) {
		rowIds.sort().forEach(rowId => siteTable.appendChild(document.getElementById(rowId)));
	}
}
function updateSitesTable(hasMap) {
	fetch(`${baseHost}/api/frontend?action=sites`)
		.then(r => r.json())
		.then(data => data.data)
		.then(sites => sites.forEach(site => {
			siteUpdateTime[site.SiteId] = site.UpdateTime;
			let newData = {
				failed: site.SiteFailed ? 'FAILED' : 'N',
				flags: makeSiteFlags(site),
				services: makeSiteServices(site),
				seen: site.SysShortname.split(',').sort().join(', '),
				updated: new Date(site.UpdateTime).toLocaleTimeString('en-US', localeTimeOptions),
			};
			if (document.getElementById(`site-${site.SiteId}`) === null) {
				const tr = document.createElement('tr');
				tr.id = `site-${site.SiteId}`;
				tr.innerHTML = `<td>${site.SiteId}</td>
					<td>${site.SiteName || 'N/A'}</td>
					<td>${site.SiteCounty || 'N/A'}</td>
					<td id="site-${site.SiteId}-failed">${newData.failed}</td>
					<td id="site-${site.SiteId}-flags">${newData.flags}</td>
					<td id="site-${site.SiteId}-services">${newData.services}</td>
					<td id="site-${site.SiteId}-seen">${newData.seen}</td>
					<td id="site-${site.SiteId}-updated">${newData.updated}</td>`;
				siteTable.appendChild(tr);
			} else {
				Object.keys(newData).forEach(key => {
					const elem = document.getElementById(`site-${site.SiteId}-${key}`);
					if (elem !== null && elem.innerHTML !== newData[key])
						elem.innerHTML = newData[key];
				});
			}

			// Handle the marker
			if (hasMap) {
				const markerOpacity = Date.now() - site.UpdateTime >= fadeSiteTime ? 0.5 : 1;
				const popupContent = `<b>${site.SiteName}</b><br>Failed: ${newData.failed}<br>Seen By: ${newData.seen}<br>Updated: ${newData.updated}`;
				if (typeof siteMarkers[site.SiteId] === 'undefined') {
					siteMarkers[site.SiteId] = L
						.marker([ site.SiteLat, site.SiteLon ], {
							opacity: markerOpacity,
							icon: L.icon({
								iconUrl: `/libs/images/${site.SiteFailed ? 'red' : 'black'}.png`,
								shadowUrl: null,
								iconSize: [32, 32],
								iconAnchor: [ 16, 32 ],
								popupAnchor: [ 0, -32 ],
							})
						})
						.bindPopup(popupContent)
						.addTo(map);
				} else {
					siteMarkers[site.SiteId]
						.getPopup()
						.setContent(popupContent);
					siteMarkers[site.SiteId]
						.setOpacity(markerOpacity);
				}
			}
		}))
		.then(updateUpdateTime)
		.then(sortAdjacentTable)
		.catch(e => console.error(e))
		.finally(() => setTimeout(updateSitesTable, 30000, hasMap));
}

function updateUpdateTime() {
	const nowTime = Date.now();

	Object.keys(siteUpdateTime).forEach(key => {
		const timeElem = document.getElementById(`site-${key}-updated`);
		if (timeElem === null) return;

		let timeDelta = Math.round((nowTime - siteUpdateTime[key]) / 1000);
		// 00:00:00 - hours - minutes - seconds
		timeElem.innerHTML = [ 60, 1 ].map(v => {
			if (timeDelta < v) return '00';

			let count = Math.floor(timeDelta / v);
			timeDelta = timeDelta - (count * v);
			return `${count}`.padStart(2, '0');
		}).join(':') + ' ago';
	});
}
setInterval(updateUpdateTime, 1000);
