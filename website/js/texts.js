window.afterAuth = window.afterAuth || [];

function getPercentile(values, percentile) {
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

function padLeft(num, len = 2) {
	return `${num}`.padStart(len, '0');
}

const vhfPageRegex = /(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/;
const dtrPageRegex = /\d{4}-(\d{10})_\d{9}(\.\d|)-call_\d+\.m4a/;
function parseForPageTime(text) {
	let d = new Date();
	if (dtrPageRegex.test(text)) {
		const match = text.match(dtrPageRegex);
		d = new Date(parseInt(match[1], 10) * 1000);
	} else {
		const match = text.match(vhfPageRegex);
		d.setUTCFullYear(parseInt(match[1], 10));
		d.setUTCMonth(parseInt(match[2], 10) - 1);
		d.setUTCDate(parseInt(match[3], 10));
		d.setUTCHours(parseInt(match[4], 10));
		d.setUTCMinutes(parseInt(match[5], 10));
		d.setUTCSeconds(parseInt(match[6], 10));
	}

	return d.getTime();
}

function dateTimeToTimeStr(datetime) {
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

function parseMediaUrls(mediaUrls) {
	return mediaUrls
		.split(',')
		.filter(s => s !== '')
		.map((v, i) => `<a href="${v}">${i + 1}</a>`)
		.join(',');
}

function makePercentString(numerator, denominator) {
	if (denominator === 0) return '';
	const percentStr = `${Math.round(numerator * 100 / denominator)}%`;

	if (numerator !== denominator) {
		return `${percentStr}<br>(${numerator})`;
	}

	return percentStr;
}

function buildTable(items, isPage = false) {
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
			.map((cell, idx) => `<td${idx >= startCenter ? ' class="text-center"' : ''}>${cell}</td$>`)
			.join(''));

	return rowsHtml
		.map(row => `<tr>${row}</tr>`)
		.join('\n');
}

let textTimes = [];
let pageTimes = [];

function getTexts() {
	fetch(`/api/frontend?action=listTexts`, {
		credentials: 'include'
	})
		.then(r => r.json())
		.then(r => r.data)
		.then(r => r.filter(t => !t.isTest))
		.then(texts => texts.sort((a, b) => a.datetime > b.datetime ? -1 : 1))
		.then(texts => texts.map(text => {
			text.isPage = text.body.indexOf('Saguache Sheriff:') === 0 ||
				text.isPage === 'y';
			text.delivered = text.delivered || [];
			text.sent = text.sent || [];
			text.undelivered = text.undelivered || [];

			if (text.isPage) {
				text.pageTime = parseForPageTime(text.body);
			}
			const subTime = text.isPage ? text.pageTime : text.datetime;

			text.delivered = text.delivered.map(t => t - subTime);
			
			if (text.isPage) {
				pageTimes = pageTimes.concat(text.delivered);
			} else {
				textTimes = textTimes.concat(text.delivered);
			}

			return text;
		}))
		.then(texts => {
			document.getElementById('texts').innerHTML = buildTable(texts.filter(text => !text.isPage));

			document.getElementById('pages').innerHTML = buildTable(texts.filter(text => text.isPage), true);

			doneLoading();
		})
		.catch(console.error);
}

window.afterAuth.push(getTexts);
