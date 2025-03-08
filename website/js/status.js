const formatHourMinute = date => {
	const dateString = date.toLocaleDateString('en-us', {
		timeZone: 'America/Denver',
		weekday: 'short'
	});
	let timeString = date.toLocaleTimeString('en-US', {
		timeZone: 'America/Denver',
		hour12: false,
		hour: '2-digit',
		minute: '2-digit'
	});

	if (timeString === '24:00') {
		timeString = `${dateString} 00:00`;
	}

	return timeString;
};
const formatDayHour = date => {
	const dateString = date.toLocaleDateString('en-us', {
		timeZone: 'America/Denver',
		weekday: 'short'
	});
	let timeString = date.toLocaleTimeString('en-US', {
		timeZone: 'America/Denver',
		hour12: false,
		hour: '2-digit',
		minute: '2-digit'
	});

	if (timeString === '24:00') {
		timeString = `00:00`;
	}

	return `${dateString} ${timeString}`;
};
const formatDay = date => date.toLocaleDateString('en-us', {
	timeZone: 'America/Denver',
	weekday: 'short',
	month: 'short',
	day: '2-digit'
});
const periodFormatters = [
	{
		period: 24 * 60 * 60,
		formatter: formatDay
	},
	{
		period: 6 * 60 * 60,
		formatter: formatDayHour
	},
	{
		period: 60 * 60,
		formatter: formatHourMinute
	},
];

const charts = [
	{
		id: 'api-calls',
		query: 'metrics=api-frontend,api-infra,api-user,api-twilio,s3-created,queue'
	},
	{
		id: 'api-errors',
		query: 'metrics=err-frontend,err-infra,err-user,err-twilio,err-s3,err-queue'
	},
	{
		id: 'sag-tower',
		query: 'metrics=tower-sag-max,tower-sag-min&period=300',
		fill: true
	},
	{
		id: 'pool-table-tower',
		query: 'metrics=tower-pt-max,tower-pt-min&period=300',
		fill: true
	},
	{
		id: 'ala-tower',
		query: 'metrics=tower-ala-max,tower-ala-min&period=300',
		fill: true
	},
	{
		id: 'texts-count',
		query: 'metrics=twilio-init,twilio-sent,twilio-delivered&period=21600'
	},
	{
		id: 'texts-time',
		val: val => Math.ceil(val / 1000),
		yMax: 120, // 2 minutes
		query: 'metrics=twilio-sent-time,twilio-delivered-time,twilio-page-time&period=21600'
	},
];

charts.forEach(chart => {
	fetch(`${baseHost}/api/frontend?action=stats&${chart.query}`)
		.then(r => r.json())
		.then(data => {
			console.log(data);
			chart.val = chart.val || (val => val);

			const names = data.data.names;
			const chartData = {};
			const labels = [];

			for (let t = data.startTime; t < data.endTime; t += (data.period * 1000)) {
				const dateStr = new Date(t).toISOString();
				chartData[dateStr] = {};
				labels.push(dateStr);
			}

			data.data.data.forEach(item => {
				Object.keys(names)
					.forEach(key => chartData[item.ts][key] = item.values[key] || 0);
			});
			labels.forEach(label => Object.keys(names)
				.forEach(key => chartData[label][key] = chart.val(chartData[label][key]) || 0));

			const formatter = periodFormatters.reduce((f, val) => {
				if (data.period <= val.period) return val.formatter;

				return f;
			}, periodFormatters[periodFormatters.length - 1].formatter);

			const datasets = Object.keys(names)
				.map(key => ({
					label: names[key],
					data: labels.map(label => chartData[label][key]),
					fill: false,
					tension: 0.1,
					pointStyle: false
				}));
			const chartConfig = {
				type: 'line',
				data: {
					labels: labels.map(label => formatter(new Date(label))),
					datasets
				},
				options: {
					interaction: {
						mode: 'x'
					}
				}
			};
			if (chart.yMax) {
				chartConfig.options.scales = {
					y: {
						max: chart.yMax
					}
				};
			}
			if (chart.fill && datasets.length === 2) {
				datasets.forEach(dataset => dataset.label = dataset.label.split(' - ').pop());
				datasets[1].fill = '-1';
				chartConfig.options.plugins = {
					annotation: {
						annotations: {
							line1: {
								type: 'line',
								yMin: 30,
								yMax: 30,
								borderColor: 'rgb(255, 99, 132)',
          			borderWidth: 2
							}
						}
					}
				};
			}

			new Chart(
				document.getElementById(chart.id),
				chartConfig
			);
		});
});
