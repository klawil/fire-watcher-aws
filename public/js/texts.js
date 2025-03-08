window.afterAuth = window.afterAuth || [];

function getPercentile(values, percentile) {
	values = values.sort((a, b) => a > b ? 1 : -1);
	const index = Math.ceil(values.length * percentile / 100) - 1;

	return values[index];
}

function padLeft(num, len = 2) {
	return `${num}`.padStart(len, '0');
}

function parseForPageTime(body) {
	const match = body.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);
	const d = new Date();
	d.setUTCFullYear(parseInt(match[1], 10));
	d.setUTCMonth(parseInt(match[2], 10) - 1);
	d.setUTCDate(parseInt(match[3], 10));
	d.setUTCHours(parseInt(match[4], 10));
	d.setUTCMinutes(parseInt(match[5], 10));
	d.setUTCSeconds(parseInt(match[6], 10));

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

function buildTable(items, isPage = false) {
	const rows = items.map(text => {
		const cells = [
			dateTimeToTimeStr(text.datetime),
			text.body,
			parseMediaUrls(text.mediaUrls),
			text.recipients,
			`${Math.round(text.delivered.length * 100 / text.recipients)}% (${text.delivered.length})`,
			`${Math.round(getPercentile(text.delivered, 1) / 1000)}s`,
			`${Math.round(getPercentile(text.delivered, 50) / 1000)}s`,
			`${Math.round(getPercentile(text.delivered, 75) / 1000)}s`,
			`${Math.round(getPercentile(text.delivered, 100) / 1000)}s`
		];
		
		if (isPage) {
			cells.splice(5, 0, `${Math.round((text.datetime - text.pageTime) / 1000)}s`);
			cells.splice(2, 1);
		}
		
		return cells;
	});

	const rowsHtml = rows
		.map(row => row
			.map(cell => `<td>${cell}</td>`)
			.join(''));

	return rowsHtml
		.map(row => `<tr>${row}</tr>`)
		.join('\n');
}

let textTimes = [];
let pageTimes = [];

function getTexts() {
	fetch(`https://fire.klawil.net/api?action=getTexts`, {
		credentials: 'include'
	})
		.then(r => r.json())
		.then(r => r.data)
		.then(r => r.filter(t => !t.isTest))
		.then(texts => texts.sort((a, b) => a.datetime > b.datetime ? -1 : 1))
		.then(texts => texts.map(text => {
			text.isPage = text.body.indexOf('Saguache Sheriff:') === 0;

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
		})
		.catch(console.error);
}

window.afterAuth.push(getTexts);
