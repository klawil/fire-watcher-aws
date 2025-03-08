import { ApiFrontendStatsResponse } from '../../common/frontendApi';
import { afterAuthUpdate, authInit, user } from './utils/auth';
import { buildMap, updateSitesTable } from './utils/sites';
import { Chart, ChartConfiguration, ChartDataset, Point, registerables } from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import { getLogger } from '../../stack/resources/utils/logger';
import { showAlert } from './utils/alerts';
import { PhoneNumberAccount, validPhoneNumberAccounts } from '../../common/userConstants';

const logger = getLogger('status');

authInit();

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

const formatDayHour: TimeFormatFn = date => {
	logger.trace('formatDayHour', date);
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
		query: 'metrics=s3-call,queue-call,alarmqueue-call,status-call,weather-call,infraapi-call,userapi-call,twilioapi-call,eventsapi-call,conferenceapi-call,frontendapi-call,audioapi-call',
	},
	{
		id: 'api-errors',
		type: 'Metric',
		query: 'metrics=s3-err-all,queue-err-all,alarmqueue-err,status-err,weather-err,infraapi-err-all,userapi-err-all,twilioapi-err-all,eventsapi-err-all,conferenceapi-err-all,frontendapi-err-all,audioapi-err-all&live=y',
	},
	{
		id: 'api-duration',
		type: 'Metric',
		query: 'metrics=s3-dur,queue-dur,alarmqueue-dur,status-dur,weather-dur,infraapi-dur,userapi-dur,twilioapi-dur,eventsapi-dur,conferenceapi-dur,frontendapi-dur,audioapi-dur',
	},
	{
		id: 'api-duration-max',
		type: 'Metric',
		query: 'metrics=s3-dur-max,queue-dur-max,alarmqueue-dur-max,status-dur-max,weather-dur-max,infraapi-dur-max,userapi-dur-max,twilioapi-dur-max,eventsapi-dur-max,conferenceapi-dur-max,frontendapi-dur-max,audioapi-dur-max&live=y',
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
		val: val => val > 300000 ? 300 : Math.ceil(val / 1000),
	},
];

async function buildChart(conf: ChartConfig): Promise<Error | null> {
	logger.trace('buildChart', ...arguments);
	const data: ApiFrontendStatsResponse = await fetch(`/api/frontend?action=stats&${conf.query}`)
		.then(r => r.json());
	
	if (
		!data.success ||
		typeof data.data === 'undefined' ||
		typeof data.startTime === 'undefined'
	) return new Error(`Failed to build chart ${conf.id}`);
	
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
			.forEach(key => {
				if (typeof conf.val !== 'undefined')
					chartData[label][key] = conf.val(chartData[label][key] || 0);
			}));

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
		if (window.innerWidth >= 992) {
			chartConfig.options = chartConfig.options || {};
			chartConfig.options.plugins = {
				legend: {
					position: 'right',
				},
			};
		} else {
			chartConfig.options = chartConfig.options || {};
			chartConfig.options.plugins = {
				legend: {
					position: 'bottom',
				},
			};
		}

		// Chart type configs
		if (conf.type === 'Timing') {
			chartConfig.options = chartConfig.options || {};
			chartConfig.options.scales = chartConfig.options.scales || {};
			chartConfig.options.scales.y = chartConfig.options.scales.y || {};
			chartConfig.options.scales.y.stacked = true;
		}
		if (conf.type === 'Tower') {
			chartConfig.options = chartConfig.options || {};
			chartConfig.options.scales = chartConfig.options.scales || {};
			chartConfig.options.scales.y = chartConfig.options.scales.y || {};
			chartConfig.options.scales.y.max = 45;
			chartConfig.options.scales.y2 = {
				type: 'linear',
				display: true,
				position: 'right',
				grid: {
					drawOnChartArea: false,
				},
			};
			datasets.forEach(dataset => dataset.label = (dataset.label || '').split(' - ').pop());

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
				below: color2.backgroundColor,
				above: 'rgba(0,0,0,0)',
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

interface CostItem {
	type: 'twilio' | 'aws';
	cat: string;
	price: number;
	priceUnit: string;
	count: number;
	countUnit: string;
}

const labels: {
	[key: string]: string;
} = {
	twilio: 'Twilio',
	aws: 'AWS',
	carrierfees: 'Carrier Fees',
	mms: 'MMS',
	sms: 'SMS',
	phonenumbers: 'Phone Numbers',
};

const moneyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});
const unitFormatter = new Intl.NumberFormat('en-US', {
	maximumFractionDigits: 2,
	minimumFractionDigits: 0,
});
async function buildCostChart(account?: PhoneNumberAccount, lastMonth: boolean = true): Promise<Error | null> {
	logger.trace('buildCostChart', ...arguments);
	const rawData = await fetch(`/api/twilio?action=billing${typeof account !== 'undefined' ? `&account=${account}`: ''}${!lastMonth ? '&month=this' : ''}`)
		.then(r => r.json());
	if (!rawData.success) {
		showAlert('danger', `Failed to load chart -  ${rawData.message || 'Unkown error'}`);
		logger.error(rawData);
		return new Error(JSON.stringify(rawData));
	} else if (rawData.data.length === 0) {
		logger.warn(`Skipping ${account || 'Total'}, no data`, rawData);
		return null;
	}

	const elem = document.getElementById(`cost-${account ? account : 'total'}-${lastMonth ? 'last' : 'this'}`) as HTMLCanvasElement;
	if (elem === null) {
		const errMsg = `Unable to render cost chart for ${account}: No element found`;
		logger.error(errMsg);
		return new Error(errMsg);
	}
	const chartLabels: string[] = [];
	const chartData: {
		data: number[];
	}[] = [
		{ // Level 1
			data: [],
		},
	];
	const keysToData: {
		[key: string]: {
			type: 'aws' | 'twilio',
			cost: number;
			count: number;
			unit: string;
		};
	} = {};
	const breakDown = [
		'carrierfees',
		'mms',
		'sms',
		'phonenumbers',
	];
	let awsTotal: number = 0;
	rawData.data.forEach((item: CostItem) => {
		keysToData[item.cat] = {
			type: item.type,
			cost: item.price,
			count: item.count,
			unit: item.countUnit,
		};

		if (item.type === 'aws' && item.price > 0) {
			breakDown.push(item.cat);
			awsTotal += item.price;
		}
	});
	delete keysToData.channels;
	if (typeof keysToData['sms-messages-carrierfees'] !== 'undefined') {
		keysToData['carrierfees'] = keysToData['carrierfees'] || {
			type: 'twilio',
			cost: 0,
			count: 0,
			unit: '',
		};
		keysToData['carrierfees'].cost += keysToData['sms-messages-carrierfees'].cost;
		keysToData['carrierfees'].count += keysToData['sms-messages-carrierfees'].count;
		keysToData['carrierfees'].unit = keysToData['sms-messages-carrierfees'].unit;
		keysToData['carrierfees-sms'] = keysToData['sms-messages-carrierfees'];
		delete keysToData['sms-messages-carrierfees'];
	}
	if (typeof keysToData['mms-messages-carrierfees'] !== 'undefined') {
		keysToData['carrierfees'] = keysToData['carrierfees'] || {
			type: 'twilio',
			cost: 0,
			count: 0,
			unit: '',
		};
		keysToData['carrierfees'].cost += keysToData['mms-messages-carrierfees'].cost;
		keysToData['carrierfees'].count += keysToData['mms-messages-carrierfees'].count;
		keysToData['carrierfees'].unit = keysToData['mms-messages-carrierfees'].unit;
		keysToData['carrierfees-mms'] = keysToData['mms-messages-carrierfees'];
		delete keysToData['mms-messages-carrierfees'];
	}
	const totalPrice = keysToData.totalprice.cost + awsTotal;
	delete keysToData.totalprice;

	// First layer
	let layerTotal = 0;
	const chartDataLookup: {
		[key: string]: {
			type: 'aws' | 'twilio' | 'other',
			cost: number;
			count: number;
			unit: string;
		};
	} = {};
	const actualTotal = breakDown.reduce((agg, key) => {
		if (typeof keysToData[key] !== 'undefined')
			agg += keysToData[key].cost;
		return agg;
	}, 0);
	Object.keys(keysToData)
		.filter(key => breakDown.includes(key))
		.sort((a, b) => keysToData[a].cost > keysToData[b].cost ? -1 : 1)
		.forEach((key, idx) => {
			if (
				idx >= 9 ||
				(
					idx >= 6 &&
					keysToData[key].cost / actualTotal < 0.1
				)
			) return;

			const data = keysToData[key];
			let label = `${labels[data.type] || data.type} - `;

			layerTotal += keysToData[key].cost;
			if (typeof labels[key] !== 'undefined') {
				label += labels[key];
			} else {
				label += key;
			}
			chartLabels.push(label);
			chartDataLookup[label] = data;
			chartData[0].data.push(keysToData[key].cost);
		});
	if (
		layerTotal < totalPrice &&
		totalPrice - layerTotal >= 0.005
	) {
		chartLabels.push('Other');
		chartData[0].data.push(totalPrice - layerTotal);
		chartDataLookup.Other = {
			type: 'other',
			cost: totalPrice - layerTotal,
			count: 0,
			unit: 'N/A',
		};
		logger.warn(`Inaccurate total price for ${account || 'Total'}, wanted ${totalPrice} got ${layerTotal}`);
	}

	const chartConfig: ChartConfiguration<'pie'> = {
		type: 'pie',
		data: {
			labels: chartLabels,
			datasets: chartData,
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: {
					position: 'right',
					labels: {
						filter: item => {
							const data = chartDataLookup[item.text];
							if (typeof data === 'undefined') return true;

							item.text += ` - ${moneyFormatter.format(data.cost)}`;
							return true;
						},
					},
				},
				tooltip: {
					callbacks: {
						title: () => `${account || 'Total'} Costs`,
						label: context => {
							const labelKey: string | null = (
								context.chart?.data?.labels &&
								context.chart?.data?.labels[context.dataIndex]
							) ? context.chart.data.labels[context.dataIndex] as string
								: null;

							if (
								labelKey === null ||
								typeof chartDataLookup[labelKey] === 'undefined'
							) {
								return `${labelKey || 'Unknown'}: ${moneyFormatter.format(Number(context.raw))}`;
							}

							const data = chartDataLookup[labelKey];
							let baseLabel = `${labelKey}: ${moneyFormatter.format(Number(context.raw))}`;
							if (data.unit !== 'N/A') {
								baseLabel += ` for ${unitFormatter.format(data.count)} ${data.unit}`;
							}
							return baseLabel;
						},
						afterBody: () => `${moneyFormatter.format(totalPrice)} Total Cost`,
					}
				},
			}
		}
	};

	new Chart(elem, chartConfig);

	return null;
}

async function refreshCharts() {
	logger.trace('refreshCharts', ...arguments);
	const promises = baseCharts.map(buildChart);
	if (user.isDistrictAdmin) {
		promises.push(
			buildCostChart(),
			...validPhoneNumberAccounts.map(a => buildCostChart(a)),
			buildCostChart(undefined, false),
			...validPhoneNumberAccounts.map(a => buildCostChart(a, false)),
		);
	}
	await Promise.all(promises);
}
afterAuthUpdate.push(refreshCharts);
