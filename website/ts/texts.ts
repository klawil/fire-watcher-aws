import { ApiFrontendListTextsResponse, TextObject } from '../../common/frontendApi';
import { showAlert } from './utils/alerts';
import { doneLoading } from './utils/loading';

const vhfPageRegex = /(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/;
const dtrPageRegex = /\d{4}-(\d{10})_\d{9}(\.\d|)-call_\d+\.m4a/;
function parseForPageTime(pageId: string): number {
	let d = new Date();
	if (dtrPageRegex.test(pageId)) {
		const match = pageId.match(dtrPageRegex);
		d = new Date(parseInt(match[1], 10) * 1000);
	} else {
		const match = pageId.match(vhfPageRegex);
		d.setUTCFullYear(parseInt(match[1], 10));
		d.setUTCMonth(parseInt(match[2], 10) - 1);
		d.setUTCDate(parseInt(match[3], 10));
		d.setUTCHours(parseInt(match[4], 10));
		d.setUTCMinutes(parseInt(match[5], 10));
		d.setUTCSeconds(parseInt(match[6], 10));
	}

	return d.getTime();
}

function padLeft(num: number, len = 2): string {
	return `${num}`.padStart(len, '0');
}

function dateTimeToTimeStr(datetime: number): string {
	let d = new Date(datetime);
	return [
		[
			padLeft(d.getFullYear(), 4),
			padLeft(d.getMonth() + 1),
			padLeft(d.getDate())
		].join('-'),
		' ',
		[
			padLeft(d.getHours()),
			padLeft(d.getMinutes()),
			padLeft(d.getSeconds())
		].join(':')
	].join('');
}

function makePercentString(numerator: number, denominator: number) {
	if (denominator === 0) return '';
	const percentStr = `${Math.round(numerator * 100 / denominator)}%`;

	if (numerator !== denominator) {
		return `${percentStr}<br>(${numerator})`;
	}

	return percentStr;
}

function parseMediaUrls(mediaUrls: string) {
	return mediaUrls
		.split(',')
		.filter(s => s !== '')
		.map((v, i) => `<a href="${v}">${i + 1}</a>`)
		.join(',');
}

function getPercentile(values: number[], percentile: number) {
	if (values.length === 0) return '';

	values = values.sort((a, b) => a > b ? 1 : -1);
	const index = Math.ceil(values.length * percentile / 100) - 1;

	let valueSeconds = Math.round(values[index] / 1000);
	const maxValue = valueSeconds;
	let timeStr = '';
	if (maxValue >= 60 * 60) {
		const hours = Math.floor(valueSeconds / (60 * 60));
		timeStr += `${hours}:`;
		valueSeconds -= (hours * 60 * 60);
	}
	const minutes = Math.floor(valueSeconds / 60);
	timeStr += `${minutes.toString().padStart(2, '0')}:`;
	valueSeconds -= (minutes * 60);
	timeStr += `${valueSeconds.toString().padStart(2, '0')}`;

	return timeStr;
}

function buildTable(items: TextObject[], isPage: boolean) {
	const rows = items.map(text => {
		const cells = [
			dateTimeToTimeStr(text.datetime),
			text.body,
			parseMediaUrls(text.mediaUrls),
			text.recipients,
			makePercentString(text.sent.length, text.recipients),
			makePercentString(text.delivered.length, text.recipients),
			makePercentString(text.undelivered.length, text.recipients),
			getPercentile(text.delivered, 50),
			getPercentile(text.delivered, 75),
			getPercentile(text.delivered, 100),
		];

		if (isPage) {
			text.csLooked = text.csLooked || [];
			cells.splice(
				7, 0,
				makePercentString(text.csLooked.length, text.recipients),
				`${Math.round((text.datetime - text.pageTime) / 1000)}s`
			);
			cells.splice(2, 1);
		}

		return cells;
	});

	const startCenter = isPage ? 2 : 3;
	const rowsHtml = rows
		.map(row => row
			.map((cell, idx) => `<td${idx >= startCenter ? ' class="text-center"' : ''}>${cell}</td>`)
			.join('')
		);
	
	return rowsHtml
		.map(row => `<tr>${row}</tr>`)
		.join('\n');
}

async function init() {
	const apiResults: ApiFrontendListTextsResponse = await fetch(`/api/frontend?action=listTexts`)
		.then(r => r.json());

	if (!apiResults.success) {
		showAlert('danger', 'Failed to get texts');
		console.error(apiResults);
		return;
	}

	const texts = apiResults.data
		.filter(v => !v.isTest)
		.sort((a, b) => a.datetime > b.datetime ? -1 : 1);

	const textsByType: {
		page: TextObject[];
		other: TextObject[];
	} = texts.reduce((agg, text) => {
		text.delivered = text.delivered || [];
		text.sent = text.sent || [];
		text.undelivered = text.undelivered || [];

		if (text.isPage === 'y')
			text.pageTime = parseForPageTime(text.body);
		
		const baselineTime = text.isPage === 'y' ? text.pageTime : text.datetime;

		text.delivered = text.delivered.map(t => t - baselineTime);

		if (text.isPage === 'y')
			agg.page.push(text);
		else
			agg.other.push(text);
		return agg;
	}, { page: [], other: [] });

	document.getElementById('texts').innerHTML = buildTable(textsByType.other, false);
	document.getElementById('pages').innerHTML = buildTable(textsByType.page, true);

	doneLoading();
}
init();
