const siteMarkers = {};
const siteUpdateTime = {};
const fadeSiteTime = 1000 * 60 * 15; // 15 minutes out of date

const makeSiteString = (keysAndNames) => (site) => {
	let flags = [];
	Object.keys(keysAndNames).forEach(key => {
		let flagStr = keysAndNames[key];
		const numTrue = Object.keys(site[key]).filter(seen => site[key][seen]).length;
		if (numTrue !== Object.keys(site[key]).length)
			flagStr += '?';
		if (numTrue > 0)
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
	fetch(`/api/frontend?action=sites`)
		.then(r => r.json())
		.then(data => data.data)
		.then(sites => sites.forEach(site => {
			const minUpdateTime = Math.floor(Date.now() / 1000) - (60 * 15);
			siteUpdateTime[site.SiteId] = Math.max.apply(null, Object.keys(site.UpdateTime).map(key => site.UpdateTime[key] * 1000));
			let newData = {
				failed: Object.keys(site.SiteFailed).filter(key => site.SiteFailed[key]).length > 0 ? 'FAILED' : 'N',
				flags: makeSiteFlags(site),
				services: makeSiteServices(site),
				seen: Object.keys(site.UpdateTime).filter(key => site.UpdateTime[key] >= minUpdateTime).sort().join(', '),
				updated: new Date(siteUpdateTime[site.SiteId]).toLocaleTimeString('en-US', localeTimeOptions),
			};
			if (document.getElementById(`site-${site.SiteId}`) === null) {
				const tr = document.createElement('tr');
				tr.id = `site-${site.SiteId}`;
				tr.innerHTML = `<td>${site.SiteId}</td>
					<td>${site.SiteName || 'N/A'}</td>
					<td class="text-end">${site.SiteCounty || 'N/A'}</td>
					<td class="text-center" id="site-${site.SiteId}-failed">${newData.failed}</td>
					<td class="text-center" id="site-${site.SiteId}-flags">${newData.flags}</td>
					<td class="text-center" id="site-${site.SiteId}-services">${newData.services}</td>
					<td class="text-center" id="site-${site.SiteId}-seen">${newData.seen}</td>
					<td class="text-end" style="font-family:monospace" id="site-${site.SiteId}-updated">${newData.updated}</td>`;
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
				const markerOpacity = Date.now() - siteUpdateTime[site.SiteId] >= fadeSiteTime ? 0.5 : 1;
				const popupContent = `<b>${site.SiteName}</b><br>Failed: ${newData.failed}<br>Seen By: ${newData.seen}<br>Updated: ${newData.updated}`;
				if (typeof siteMarkers[site.SiteId] === 'undefined') {
					siteMarkers[site.SiteId] = L
						.marker([ site.SiteLat, site.SiteLon ], {
							opacity: markerOpacity,
							icon: L.icon({
								iconUrl: `/libs/images/${newData.failed === 'FAILED' ? 'red' : 'black'}.png`,
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

		// 00d 00h00m00s
		let timeDelta = Math.round((nowTime - siteUpdateTime[key]) / 1000);
		const periodValues = [ 24 * 60 * 60, 60 * 60, 60, 1 ];
		const periodLabels = [ 'd ', 'h', 'm', 's' ];
		let hasHadValue = false;
		const newHtml = periodValues.map((v, i) => {
			if (timeDelta < v && !hasHadValue) return '';
			else if (timeDelta < v) return `00${periodLabels[i]}`;
			hasHadValue = true;

			let count = Math.floor(timeDelta / v);
			timeDelta = timeDelta - (count * v);
			return `${count}`.padStart(2, '0') + periodLabels[i];
		}).join('');
		if (timeElem.innerHTML !== newHtml)
			timeElem.innerHTML = newHtml;
	});
}
setInterval(updateUpdateTime, 100);
