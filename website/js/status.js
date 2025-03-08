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
];

const color1 = {
	backgroundColor: 'rgba(54, 162, 235, 0.5)',
	borderColor: 'rgb(54, 162, 235)'
};
const color2 = {
	backgroundColor: 'rgba(255, 99, 132, 0.5)',
	borderColor: 'rgb(255, 99, 132)'
};

const baseCharts = [
	{
		id: 'api-calls',
		query: 'metrics=api-frontend,api-infra,api-user,api-twilio,s3-created,queue'
	},
	{
		id: 's3-uploads',
		query: 'metrics=tower-sag-upload,tower-ala-upload,tower-pt-upload,tower-sa-upload,tower-mv-upload&live=y'
	},
	{
		id: 'api-errors',
		query: 'metrics=err-frontend,err-infra,err-user,err-twilio,err-s3,err-queue&live=y'
	},
	{
		id: 'sag-tower',
		query: 'metrics=tower-sag-max,tower-sag-min&period=300&timerange=86400000&live=y',
		fill: true
	},
	{
		id: 'pool-table-tower',
		query: 'metrics=tower-pt-max,tower-pt-min&period=300&timerange=86400000&live=y',
		fill: true
	},
	{
		id: 'ala-tower',
		query: 'metrics=tower-ala-max,tower-ala-min&period=300&timerange=86400000&live=y',
		fill: true
	},
	{
		id: 'sa-tower',
		query: 'metrics=tower-sa-max,tower-sa-min&period=300&timerange=86400000&live=y',
		fill: true
	},
	{
		id: 'mv-tower',
		query: 'metrics=tower-mv-max,tower-mv-min&period=300&timerange=86400000&live=y',
		fill: true
	},
	{
		id: 'texts-count',
		query: 'metrics=twilio-init,twilio-sent,twilio-delivered&period=86400&timerange=2419200000&live=y'
	},
	{
		id: 'texts-time',
		val: val => val > 150000 ? 150 : Math.ceil(val / 1000),
		stacked: true,
		query: 'metrics=twilio-page-duration,twilio-page-time,twilio-sent-time,twilio-delivered-sent-time&period=86400&timerange=2419200000&live=y'
	},
];

let currentCharts = {};

let refreshConfig = null;
let lastInitId = null;
function refreshCharts(refreshFrom = null) {
	if (refreshFrom !== null && refreshFrom !== lastInitId)
		return;

	const thisInitId = Date.now()
	lastInitId = thisInitId;
	Promise.all(charts.map(chart => fetch(`${baseHost}/api/frontend?action=stats&${chart.query}`)
			.then(r => r.json())
			.then(data => {
				if (lastInitId !== thisInitId) return;

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
				if (window.innerWidth >= 992) {
					chartConfig.options.plugins = {
						legend: {
							position: 'right'
						}
					};
				} else {
					chartConfig.options.plugins = {
						legend: {
							position: 'bottom'
						}
					};
				}
				if (chart.yMax) {
					chartConfig.options.scales = {
						y: {
							max: chart.yMax
						}
					};
				}
				if (chart.stacked) {
					chartConfig.options.scales = chartConfig.options.scales || {};
					chartConfig.options.scales.y = chartConfig.options.scales.y || {};
					chartConfig.options.scales.y.stacked = true;
				}
				if (chart.fill && datasets.length === 2) {
					chartConfig.options.scales = {
						y: {
							min: 0,
							max: 45
						}
					};
					datasets.forEach(dataset => dataset.label = dataset.label.split(' - ').pop());
					datasets[0].borderColor = color1.borderColor;
					datasets[0].backgroundColor = color1.backgroundColor;
					datasets[0].showLine = false;
					datasets[0].fill = {
						target: 2,
						above: color1.backgroundColor,
						below: 'rgba(0,0,0,0)'
					};
					datasets[1].borderColor = color2.borderColor;
					datasets[1].backgroundColor = color2.backgroundColor;
					datasets[1].showLine = false;
					datasets[1].fill = {
						target: 2,
						below: color2.backgroundColor,
						above: 'rgba(0,0,0,0)'
					};
					datasets.push(({
						backgroundColor: 'rgba(0,0,0,0)',
						fillColor: 'rgba(0,0,0,0)',
						fill: false,
						pointStyle: false,
						tension: 0.0,
						label: 'none',
						data: labels.map((label, i) => {
							const dataA = datasets[0].data[i];
							const dataB = datasets[1].data[i];

							if (dataA < 30 && dataB < 30) {
								return dataA;
							}
							if (dataA > 30 && dataB > 30) {
								return dataB;
							}
							return 30;
						})
					}))
					chartConfig.options.plugins = {
						annotation: {
							annotations: {
								line1: {
									type: 'line',
									label: {
										content: 'Service Degraded',
										display: true,
										color: '#000',
										backgroundColor: 'transparent',
										yAdjust: 10
									},
									yMin: 30,
									yMax: 30,
									borderColor: 'rgb(255, 99, 132)',
									borderWidth: 2
								},
								line2: {
									type: 'line',
									label: {
										content: 'Optimal Service',
										display: true,
										color: '#000',
										backgroundColor: 'transparent',
										yAdjust: -10
									},
									yMin: 40,
									yMax: 40,
									borderColor: color1.borderColor,
									borderWidth: 2
								}
							}
						},
						legend: {
							display: false,
							labels: {
								filter: a => a.text !== 'none'
							}
						},
						tooltip: {
							filter: (a, b, c) => a.dataset.label !== 'none' &&
								c.map(v => v.dataset.label).indexOf(a.dataset.label) === b
						}
					};
				}


				if (typeof currentCharts[chart.id] === 'undefined')
					currentCharts[chart.id] = new Chart(
						document.getElementById(chart.id),
						chartConfig
					);
				else {
					currentCharts[chart.id].options = chartConfig.options;
					currentCharts[chart.id].data = chartConfig.data;
					currentCharts[chart.id].update();
				}
			})))
		.then(() => {
			if (thisInitId !== lastInitId) return;

			if (refreshConfig !== null)
				setTimeout(refreshCharts, refreshConfig, thisInitId);
		});
}

let charts = baseCharts;
refreshCharts();

const refreshData = document.getElementById('refresh-interval');
const realtimeData = document.getElementById('realtime-switch');
const dataRange = document.getElementById('data-range');

realtimeData.addEventListener('change', () => {
	dataRange.value = 'off';

	if (!realtimeData.checked) {
		charts = baseCharts;
		refreshCharts();
		return;
	}

	charts = baseCharts.map(chart => {
		const newChart = { ...chart };
		newChart.query = `${chart.query.split('&')[0]}&period=60&timerange=7200000&live=y`;

		return newChart
	});
	refreshCharts();
});

dataRange.addEventListener('change', () => {
	if (dataRange.value === 'off') {
		charts = baseCharts;
		refreshCharts();
		return;
	};

	realtimeData.checked = false;

	const newTimerange = parseInt(dataRange.value, 10) * (1000 * 60 * 60);

	charts = baseCharts.map(chart => {
		const newChart = { ...chart };
		newChart.query = `${chart.query.split('&')[0]}&timerange=${newTimerange}`;
	
		return newChart;
	});
	refreshCharts();
});

refreshData.addEventListener('change', () => {
	if (refreshData.value === 'off') {
		refreshConfig = null;
	} else {
		refreshConfig = parseInt(refreshData.value, 10);
		if (lastInitId !== null && Date.now() - lastInitId >= refreshConfig)
			refreshCharts();
		else
			setTimeout(refreshCharts, refreshConfig + lastInitId - Date.now());
	}
});
