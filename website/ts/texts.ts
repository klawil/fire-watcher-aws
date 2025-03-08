import { ApiFrontendListTextsResponse, TextObject } from '../../common/frontendApi';
import { showAlert } from './utils/alerts';
import { doneLoading } from './utils/loading';
import { createTableRow } from './utils/table';
import { authInit } from './utils/auth';
import { getLogger } from '../../common/logger';

const logger = getLogger('texts');

authInit();

const vhfPageRegex = /(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/;
const dtrPageRegex = /\d{4}-(\d{10})_\d{9}(\.\d|)-call_\d+\.m4a/;
function parseForPageTime(pageId: string): number {
	logger.trace('parseForPageTime', ...arguments);
	let d = new Date();
	if (dtrPageRegex.test(pageId)) {
		const match = pageId.match(dtrPageRegex) as string[];
		d = new Date(parseInt(match[1], 10) * 1000);
	} else {
		const match = pageId.match(vhfPageRegex) as string[];
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
	logger.trace('padLeft', ...arguments);
	return `${num}`.padStart(len, '0');
}

function dateTimeToTimeStr(datetime: number): string {
	logger.trace('dateTimeToTimeStr', ...arguments);
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
	logger.trace('makePercentString', ...arguments);
	if (denominator === 0) return '';
	const percentStr = `${Math.round(numerator * 100 / denominator)}%`;

	if (numerator !== denominator) {
		return `${percentStr}<br>(${numerator})`;
	}

	return percentStr;
}

function parseMediaUrls(mediaUrls: string) {
	logger.trace('parseMediaUrls', ...arguments);
	return mediaUrls
		.split(',')
		.filter(s => s !== '')
		.map((v, i) => `<a href="${v}">${i + 1}</a>`)
		.join(',');
}

function getPercentile(values: number[], percentile: number) {
	logger.trace('getPercentile', ...arguments);
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

function buildTable(
	tbody: HTMLTableSectionElement,
	items: TextObject[],
	isPage: boolean
) {
	logger.trace('buildTable', ...arguments);
	items.forEach(text => {
		text.sent = text.sent || [];
		text.delivered = text.delivered || [];
		text.undelivered = text.undelivered || [];
		text.csLooked = text.csLooked || [];

		createTableRow(tbody, {
			columns: [
				{
					html: dateTimeToTimeStr(text.datetime),
				},
				{
					html: text.body.replace(/\n/g, '<br>'),
				},
				{
					filter: !isPage,
					html: parseMediaUrls(text.mediaUrls),
				},
				{
					classList: [ 'text-center' ],
					html: text.recipients.toString(),
				},
				{
					classList: [ 'text-center' ],
					html: makePercentString(text.sent.length, text.recipients),
				},
				{
					classList: [ 'text-center' ],
					html: makePercentString(text.delivered.length, text.recipients),
				},
				{
					classList: [ 'text-center' ],
					html: makePercentString(text.undelivered.length, text.recipients),
				},
				{
					filter: isPage,
					classList: [ 'text-center' ],
					html: makePercentString(text.csLooked.length, text.recipients),
				},
				{
					filter: isPage,
					classList: [ 'text-center' ],
					html: `${Math.round((text.datetime - (text.pageTime || text.datetime)) / 1000)}s`,
				},
				{
					classList: [ 'text-center' ],
					html: getPercentile(text.delivered, 50),
				},
				{
					classList: [ 'text-center' ],
					html: getPercentile(text.delivered, 75),
				},
				{
					classList: [ 'text-center' ],
					html: getPercentile(text.delivered, 100),
				},
			]
		});
	});
}

async function init() {
	logger.trace('init', ...arguments);
	const apiResults: ApiFrontendListTextsResponse = await fetch(`/api/frontend?action=listTexts`)
		.then(r => r.json());

	if (!apiResults.success || typeof apiResults.data === 'undefined') {
		showAlert('danger', 'Failed to get texts');
		logger.error('init', apiResults);
		return;
	}

	const texts = apiResults.data
		.filter(v => !v.isTest)
		.sort((a, b) => a.datetime > b.datetime ? -1 : 1);

	const textsByType: {
		page: TextObject[];
		other: TextObject[];
	} = texts.reduce((agg: {
		page: TextObject[];
		other: TextObject[];
	}, text) => {
		text.delivered = text.delivered || [];
		text.sent = text.sent || [];
		text.undelivered = text.undelivered || [];

		if (text.isPage === 'y')
			text.pageTime = parseForPageTime(text.body);
		
		const baselineTime = text.isPage === 'y' ? text.pageTime || text.datetime : text.datetime;

		text.delivered = text.delivered.map(t => t - baselineTime);

		if (text.isPage === 'y')
			agg.page.push(text);
		else
			agg.other.push(text);
		return agg;
	}, { page: [], other: [] });

	buildTable(
		<HTMLTableSectionElement>document.getElementById('texts'),
		textsByType.other,
		false
	);
	buildTable(
		<HTMLTableSectionElement>document.getElementById('pages'),
		textsByType.page,
		true
	);

	doneLoading();
}
init();
