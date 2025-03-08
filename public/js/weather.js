const newWidth = [ ...document.getElementsByClassName('img-container') ][0].clientWidth;
const ratio = 555 / 815;
const newHeight = Math.ceil(newWidth * ratio);
document.head.innerHTML += `<style>
	.img-container {
		height: ${newHeight}px;
	}
</style>`

const insertionPoints = {
	readiness: document.getElementById('readiness'),
	fires: document.getElementById('fires'),
	alerts: document.getElementById('alerts'),
	restrictions: document.getElementById('restrictions')
};
const fireTypeLabels = {
	new: 'New',
	ongoing: 'Ongoing',
	rx: 'RX'
};
const maxFireTypeLabelLen = Object.keys(fireTypeLabels)
	.map(key => fireTypeLabels[key])
	.reduce((len, label) => len < label.length ? label.length : len, 0);

function padEndWithSpaces(value, len) {
	if (typeof value !== 'string') {
		value = value.toString();
	}

	return value.padEnd(len, '+')
		.replace(/\+/g, '&nbsp;');
}

function padStartWithSpaces(value, len) {
	if (typeof value !== 'string') {
		value = value.toString();
	}

	return value.padStart(len, '+')
		.replace(/\+/g, '&nbsp;');
}

fetch('/weather.json')
	.then(r => r.json())
	.then(data => {
		insertionPoints.readiness.innerHTML = `National... ${data.readiness.National} ... <a href="https://www.nifc.gov/nicc/sitreprt.pdf">National SitRep</a><br>RM GACC ... ${data.readiness['RM Area']} ... <a href="https://gacc.nifc.gov/rmcc/intell.php">RM GACC Intel</a>`;

		insertionPoints.fires.innerHTML = `<b>${padEndWithSpaces('Type', maxFireTypeLabelLen)} ... Saguache ... Colorado</b><br>`
			+ Object.keys(data.stateFires)
				.filter(key => typeof fireTypeLabels[key] !== 'undefined')
				.map(key => `${padEndWithSpaces(fireTypeLabels[key], maxFireTypeLabelLen)} ... ${padStartWithSpaces(data.stateFires[key][0], 8)} ... ${padStartWithSpaces(data.stateFires[key][1], 8)}`)
				.join('<br>');

		insertionPoints.alerts.innerHTML = data.weather || '<b>No active alerts</b>';
		insertionPoints.restrictions.innerHTML = data.bans;
	});
