import { FireTypes, WeatherResultJson } from '../../common/weather';
import { authInit } from './utils/auth';
import { doneLoading } from './utils/loading';
import { getLogger } from '../../stack/resources/utils/logger';

const logger = getLogger('weather');

authInit();

const newWidth = Array.from(document.getElementsByClassName('img-container'))[0].clientWidth;
const ratio = 555 / 815;
const newHeight = Math.ceil(newWidth * ratio);
document.head.innerHTML += `<style>
	.img-container {
		height: ${newHeight}px;
	}
</style>`;

const insertionPoints: {
	[key: string]: HTMLDivElement;
} = {
	readiness: <HTMLDivElement>document.getElementById('readiness'),
	fires: <HTMLDivElement>document.getElementById('fires'),
	alerts: <HTMLDivElement>document.getElementById('alerts'),
	restrictions: <HTMLDivElement>document.getElementById('restrictions'),
	updated: <HTMLDivElement>document.getElementById('updated')
};
const fireTypeLabels: {
	[key in FireTypes]?: string;
} = {
	new: 'New',
	ongoing: 'Ongoing',
	rx: 'RX',
};
const maxFireTypeLabelLen = (<FireTypes[]>Object.keys(fireTypeLabels))
	.map(key => fireTypeLabels[key] || key)
	.reduce((len, label) => len < label.length ? label.length : len, 0);

function padEndWithSpaces(value: string | number, len: number) {
	logger.trace('padEndWithSpaces', ...arguments);
	if (typeof value !== 'string') {
		value = value.toString();
	}

	return value.padEnd(len, '+')
		.replace(/\+/g, '&nbsp;');
}

function padStartWithSpaces(value: string | number, len: number) {
	logger.trace('padStartWithSpaces', ...arguments);
	if (typeof value !== 'string') {
		value = value.toString();
	}

	return value.padStart(len, '+')
		.replace(/\+/g, '&nbsp;');
}

async function init() {
	logger.trace('init', ...arguments);
	const result: WeatherResultJson = await fetch('./weather.json')
		.then(r => r.json());

	insertionPoints.readiness.innerHTML = `National... ${result.readiness.National} ... <a href="https://www.nifc.gov/nicc/sitreprt.pdf">National SitRep</a><br>`
		+ `RM GACC ... ${result.readiness['RMA']} ... <a href="https://gacc.nifc.gov/rmcc/intelligence.php">RM GACC Intel</a>`;
	
	insertionPoints.fires.innerHTML = `<b>${padEndWithSpaces('Type', maxFireTypeLabelLen)} ... Saguache ... Colorado</b><br>`
		+ (<FireTypes[]>Object.keys(result.stateFires))
			.filter(key => typeof fireTypeLabels[key] !== 'undefined')
			.map(key => `${padEndWithSpaces(fireTypeLabels[key] || key, maxFireTypeLabelLen)} ... ${padStartWithSpaces(result.stateFires[key][0], 8)} ... ${padStartWithSpaces(result.stateFires[key][1], 8)}`)
			.join('<br>');
	doneLoading();
}
init();
