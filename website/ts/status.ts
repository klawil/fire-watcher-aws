import { ApiFrontendStatsResponse } from '../../common/frontendApi';
import { buildMap, updateSitesTable } from './utils/sites';
import { Chart, ChartConfiguration, ChartDataset, Point, registerables } from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';

Chart.register(...registerables);
Chart.register(annotationPlugin);

buildMap('map');
updateSitesTable();

type TimeFormatFn = (a: Date) => string;

interface ColorConfig {
	backgroundColor: string;
	borderColor: string;
}

type ChartTypes = 'Tower' | 'Metric' | 'Timing';

interface ChartConfig {
	id: string;
	query: string;
	type: ChartTypes;
	val?: (a: number) => number;
}

const formatHourMinute: TimeFormatFn = date => {
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
}
const formatDayHour: TimeFormatFn = date => {
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
}
const formatDay: TimeFormatFn = date => date.toLocaleDateString('en-us', {
	timeZone: 'America/Denver',
	weekday: 'short',
	month: 'short',
	day: '2-digit',
});

const periodFormatters: {
	period: number;
	formatter: TimeFormatFn
}[] = [
	{
		period: 24 * 60 * 60,
		formatter: formatDay,
	},
	{
		period: 6 * 60 * 60,
		formatter: formatDayHour,
	},
];

const color1: ColorConfig = {
	backgroundColor: 'rgba(54, 162, 235, 0.5)',
	borderColor: 'rgb(54, 162, 235)'
};
const color2: ColorConfig = {
	backgroundColor: 'rgba(255, 99, 132, 0.5)',
	borderColor: 'rgb(255, 99, 132)'
};

const baseCharts: ChartConfig[] = [
	{
		id: 'api-calls',
		type: 'Metric',
		query: 'metrics=s3-call,queue-call,alarmqueue-call,status-call,weather-call,infraapi-call,userapi-call,twilioapi-call,eventsapi-call,conferenceapi-call,frontendapi-call',
	},
	{
		id: 'api-errors',
		type: 'Metric',
		query: 'metrics=s3-err-all,queue-err-all,alarmqueue-err,status-err,weather-err,infraapi-err-all,userapi-err-all,twilioapi-err-all,eventsapi-err-all,conferenceapi-err-all,frontendapi-err-all&live=y',
	},
	{
		id: 'api-duration',
		type: 'Metric',
		query: 'metrics=s3-dur,queue-dur,alarmqueue-dur,status-dur,weather-dur,infraapi-dur,userapi-dur,twilioapi-dur,eventsapi-dur,conferenceapi-dur,frontendapi-dur',
	},
	{
		id: 'api-duration-max',
		type: 'Metric',
		query: 'metrics=s3-dur-max,queue-dur-max,alarmqueue-dur-max,status-dur-max,weather-dur-max,infraapi-dur-max,userapi-dur-max,twilioapi-dur-max,eventsapi-dur-max,conferenceapi-dur-max,frontendapi-dur-max',
	},
	{
		id: 's3-uploads',
		type: 'Metric',
		query: 'metrics=tower-sag-upload,tower-ala-upload,tower-pt-upload,tower-sa-upload,tower-mv-upload&live=y',
	},
	{
		id: 'sag-tower',
		type: 'Tower',
		query: 'metrics=tower-sag-max,tower-sag-min,tower-sag-upload&period=300&timerange=86400000&live=y',
	},
	{
		id: 'pool-table-tower',
		type: 'Tower',
		query: 'metrics=tower-pt-max,tower-pt-min,tower-pt-upload&period=300&timerange=86400000&live=y',
	},
	{
		id: 'ala-tower',
		type: 'Tower',
		query: 'metrics=tower-ala-max,tower-ala-min,tower-ala-upload&period=300&timerange=86400000&live=y',
	},
	{
		id: 'sa-tower',
		type: 'Tower',
		query: 'metrics=tower-sa-max,tower-sa-min,tower-sa-upload&period=300&timerange=86400000&live=y',
	},
	{
		id: 'vhf-heartbeat',
		type: 'Metric',
		query: 'metrics=status-120-home,status-cvfd-station&period=300&timerange=86400000',
	},
	{
		id: 'texts-count',
		type: 'Metric',
		query: 'metrics=twilio-init,twilio-sent,twilio-delivered&period=86400&timerange=2419200000&live=y',
	},
	{
		id: 'texts-time',
		type: 'Timing',
		query: 'metrics=twilio-page-duration,twilio-page-time,twilio-sent-time,twilio-delivered-sent-time&period=86400&timerange=2419200000&live=y',
		val: val => val > 150000 ? 150 : Math.ceil(val / 1000),
	},
];

async function buildChart(conf: ChartConfig): Promise<Error | null> {
	const data: ApiFrontendStatsResponse = await fetch(`/api/frontend?action=stats&${conf.query}`)
		.then(r => r.json());
	
	if (!data.success) return new Error(`Failed to build chart ${conf.id}`);
	
	try {
		conf.val = conf.val || (val => val);

		const names = data.data.names;
		const chartData: {
			[key: string]: {
				[key: string]: number;
			};
		} = {};
		const labels: string[] = [];

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
			.forEach(key => chartData[label][key] = conf.val(chartData[label][key] || 0)));

		const formatter = periodFormatters.reduce((f, val) => {
			if (data.period <= val.period) return val.formatter;

			return f;
		}, periodFormatters[periodFormatters.length - 1].formatter);

		const datasets: ChartDataset<"line", (number | Point)[]>[] = Object.keys(names)
			.map(key => ({
				label: names[key],
				data: labels.map(label => chartData[label][key]),
				fill: false,
				tension: 0.1,
				pointStyle: false,
			}));
		const chartConfig: ChartConfiguration<'line'> = {
			type: 'line',
			data: {
				labels: labels.map(label => formatter(new Date(label))),
				datasets,
			},
			options: {
				interaction: {
					mode: 'index',
				},
				scales: {
					y: {
						min: 0,
					},
				},
			},
		};
		if (window.innerWidth >= 992)
			chartConfig.options.plugins = {
				legend: {
					position: 'right',
				},
			};
		else
			chartConfig.options.plugins = {
				legend: {
					position: 'bottom',
				},
			};

		// Chart type configs
		if (conf.type === 'Timing')
			chartConfig.options.scales.y.stacked = true;
		if (conf.type === 'Tower') {
			chartConfig.options.scales.y.max = 45;
			chartConfig.options.scales.y2 = {
				type: 'linear',
				display: true,
				position: 'right',
				grid: {
					drawOnChartArea: false,
				},
			};
			datasets.forEach(dataset => dataset.label = dataset.label.split(' - ').pop());

			datasets[0].borderColor = color1.borderColor;
			datasets[0].backgroundColor = color1.backgroundColor;
			datasets[0].showLine = false;
			datasets[0].fill = {
				target: 3,
				above: color1.backgroundColor,
				below: 'rgba(0,0,0,0)',
			};

			datasets[1].borderColor = color2.borderColor;
			datasets[1].backgroundColor = color2.backgroundColor;
			datasets[1].showLine = false;
			datasets[1].fill = {
				target: 3,
				above: color2.backgroundColor,
				below: 'rgba(0,0,0,0)',
			};

			datasets[2].yAxisID = 'y2';

			datasets.push({
				backgroundColor: 'rgba(0,0,0,0)',
				fill: false,
				pointStyle: false,
				tension: 0.0,
				label: 'none',
				data: labels.map((label, i) => {
					const dataA = <number>datasets[0].data[i];
					const dataB = <number>datasets[1].data[i];

					if (dataA < 30 && dataB < 30)
						return dataA;
					if (dataA > 30 && dataB > 30)
						return dataB;
					return 30;
				})
			});

			chartConfig.options.plugins = chartConfig.options.plugins || {};
			chartConfig.options.plugins.annotation = {
				annotations: {
					line1: {
						type: 'line',
						label: {
							content: 'Service Degraded',
							display: true,
							color: '#000',
							backgroundColor: 'transparent',
							yAdjust: 10,
						},
						yMin: 30,
						yMax: 30,
						borderColor: 'rgb(255, 99, 132)',
						borderWidth: 2,
					},
					line2: {
						type: 'line',
						label: {
							content: 'Optimal Service',
							display: true,
							color: '#000',
							backgroundColor: 'transparent',
							yAdjust: -10,
						},
						yMin: 40,
						yMax: 40,
						borderColor: color1.borderColor,
						borderWidth: 2,
					},
				},
			};

			chartConfig.options.plugins.legend = {
				display: false,
			};
			
			chartConfig.options.plugins.tooltip = {
				filter: (a, b, c) => a.dataset.label !== 'none' &&
					c.map(v => v.dataset.label).indexOf(a.dataset.label) === b,
			};
		}

		new Chart(
			<HTMLCanvasElement>document.getElementById(conf.id),
			chartConfig
		);
	} catch (e) {
		return <Error>e;
	}

	return null;
}

async function refreshCharts() {
	const results = await Promise.all(baseCharts.map(buildChart));

	console.log(results);
}
refreshCharts();
