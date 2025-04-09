import { getLogger } from "@/utils/common/logger";
import { handleResourceApi, LambdaApiFunction, parseJsonBody } from "./_base";
import { eventMetricValidator, GetMetricsApi, getMetricsApiBodyValidator, LambdaMetric, lambdaMetricValidator, MetricToFetch, towerMetricValidator } from "@/types/api/metrics";
import { generateApi400Body } from "@/types/api/_shared";
import { validateObject } from "@/utils/backend/validation";
import CloudWatch, { GetMetricDataInput, MetricDataQueries } from "aws-sdk/clients/cloudwatch";

const logger = getLogger('metrics');
const cloudwatch = new CloudWatch();

function buildMetricKey(metric: MetricToFetch): string {
  let key: string = `${metric.type}_`;
  switch (metric.type) {
    case 'lambda':
      key += `${metric.fn}_${metric.metric}_${metric.stat}`;
      break;
    case 'event':
      key += `${metric.namespace}_${metric.metricName}`;
      if (typeof metric.source !== 'undefined')
        key += `_${metric.source}`;
      if (typeof metric.action !== 'undefined')
        key += `_${metric.action}`;
      break;
    case 'tower':
      key += `${metric.tower}_${metric.metric}_${metric.stat}`;
      break;
  }
  return key.replace(/ /g, '_').replace(/[^A-Za-z0-9_]/g, '');
}

const lambdaNameEnvRegex = /^(A|I)_([0-9A-Z_]+)_FN_NAME$/;
const lambdaNames: {
  [key: string]: {
    name: string;
    label: string;
  };
} = Object.keys(process.env)
  .filter(key => key.endsWith('_FN_NAME') && lambdaNameEnvRegex.test(key))
  .reduce((agg: typeof lambdaNames, key) => {
    const value = process.env[key];
    const pieces = key.match(lambdaNameEnvRegex);
    if (
      typeof value === 'undefined' ||
      pieces === null
    ) return agg;

    agg[key] = {
      name: value === 'self'
        ? process.env.AWS_LAMBDA_FUNCTION_NAME as string
        : value,
      label: pieces[1] === 'I'
        ? pieces[2].toLowerCase()
        : pieces[2].replace(/_/g, '/').toLowerCase(),
    };

    return agg;
  }, {});
const specialLambdaNames = {
  all: 'All Functions',
  all_A: 'All API Functions',
  all_I: 'All Infrastructure Functions',
} as const;

function buildLambdaMetric(
  metric: LambdaMetric,
  body: Required<Pick<GetMetricsApi['body'], 'period'>>,
): [ MetricDataQueries, string[] ] {
  const key = buildMetricKey(metric);
  const conf = lambdaNames[metric.fn];
  if (typeof conf === 'undefined') {
    console.log(lambdaNames);
    throw new Error(`Invalid fn - ${metric.fn}`);
  }

  const metricToPush: MetricDataQueries[number] = {
    Id: key,
    ReturnData: true,
    Label: `${conf.label || metric.fn} ${metric.metric}`,
    MetricStat: {
      Metric: {
        Namespace: 'AWS/Lambda',
        MetricName: metric.metric,
        Dimensions: [{
          Name: 'FunctionName',
          Value: conf.name,
        }],
      },
      Period: body.period,
      Stat: metric.stat,
    },
  };

  return [
    [ metricToPush ],
    [ key ],
  ];
}

function buildSpecialLambdaMetric(
  metric: LambdaMetric,
  body: Required<Pick<GetMetricsApi['body'], 'period'>>,
): [ MetricDataQueries, string[] ] {
  if (!(metric.fn in specialLambdaNames)) return [ [], [] ];

  const metricsToUse: MetricDataQueries = [];
  const keysToUse: string[] = [];

  const fnName = metric.fn as keyof typeof specialLambdaNames;
  Object.keys(lambdaNames)
    .filter(name => {
      if (fnName === 'all') return true;

      if (fnName === 'all_A' && name.startsWith('A_')) return true;

      if (fnName === 'all_I' && name.startsWith('I_')) return true;

      return false;
    })
    .forEach(name => {
      const [ [metricQuery], [metricKey] ] = buildLambdaMetric(
        {
          ...metric,
          fn: name,
        },
        body,
      );
      metricsToUse.push(metricQuery);
      keysToUse.push(metricKey);
    });

  return [metricsToUse, keysToUse];
}

const periodToTime: {
	period: number; // seconds
	timerange: number; // milliseconds
}[] = [
	{
		timerange: 365 * 24 * 60 * 60, // 365 days (1 year)
		period: 24 * 60 * 60 // 24 hours
	},
	{
		timerange: 28 * 24 * 60 * 60, // 28 days (1 month)
		period: 6 * 60 * 60 // 6 hours
	},
	{
		timerange: 7 * 24 * 60 * 60, // 7 days
		period: 60 * 60 // 1 hour
	},
	{
		timerange: 24 * 60 * 60, // 24 hours
		period: 15 * 60 // 15 minutes
	},
	{
		timerange: 6 * 60 * 60, // 6 hours
		period: 5 * 60 // 5 minutes
	},
	{
		timerange: 60 * 60, // 1 hour
		period: 60 // 1 minute
	},
];

function getPeriodFromTimerange(timerange: number) {
  return periodToTime.reduce((period, item) => {
    if (timerange <= item.timerange) return item.period;

    return period;
  }, periodToTime[0].period);
}
function getTimerangeFromPeriod(period: number) {
  return periodToTime.reduce((timerange, item) => {
    if (period <= item.period) return item.timerange;

    return timerange;
  }, periodToTime[0].timerange);
}

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

const POST: LambdaApiFunction<GetMetricsApi> = async function (event) {
  logger.trace('POST', ...arguments);

  // Validate the body (part 1)
  const [ body, bodyErrors ] = parseJsonBody(
    event.body,
    getMetricsApiBodyValidator,
  );
  if (
    body === null ||
    bodyErrors.length > 0
  ) return [ 400, generateApi400Body(bodyErrors) ];

  // Validate the individual metrics
  const allErrors: string[] = [];
  body.metrics.forEach((metric, i) => {
    let metricParsed: typeof metric | null = null;
    let metricErrors: string[] = [];
    switch (metric.type) {
      case 'event':
        [ metricParsed, metricErrors ] = validateObject(
          metric,
          eventMetricValidator,
        );
        break;
      case 'lambda':
        [ metricParsed, metricErrors ] = validateObject(
          metric,
          lambdaMetricValidator,
        );

        // Verify the function is known
        if (
          metricParsed !== null &&
          !(metricParsed.fn in specialLambdaNames) &&
          typeof lambdaNames[metricParsed.fn] === 'undefined'
        ) {
          metricErrors.push('fn');
        }
        break;
      case 'tower':
        [ metricParsed, metricErrors ] = validateObject(
          metric,
          towerMetricValidator,
        );
        break;
    }

    if (metricErrors.length > 0) {
      metricErrors.forEach(err => allErrors.push(`${i}-${err}`));
    } else if (metricParsed === null) {
      allErrors.push(`${i}`);
    } else {
      body.metrics[i] = metricParsed;
    }
  });
  if (allErrors.length > 0)
    return [ 400, generateApi400Body(allErrors) ];
  if (body.metrics.length === 0)
    return [ 400, generateApi400Body([ 'metrics' ]) ];

  // Get the timezone information
  const nowDate = new Date();
	const timeZoneOffset = ((new Date(nowDate.toLocaleString('en-US', { timeZone: 'America/Denver' })).getTime()) -
	(new Date(nowDate.toLocaleString('en-US', { timeZone: 'UTC' })).getTime()));
	const timeZoneHourOffset = timeZoneOffset / 6e4;
	const timeZoneStr = `${timeZoneHourOffset > 0 ? '+' : '-'}${Math.abs(timeZoneHourOffset / 60).toString().padStart(2, '0')}00`;

  // Check for a timerange but not period being provided
  if (
    typeof body.timerange !== 'undefined' &&
    typeof body.period === 'undefined'
  ) {
    body.period = getPeriodFromTimerange(body.timerange);
  }

  // Build the default time values and direction to expand the values
  const dir = body.live === 'y'
    ? 'ceil'
    : 'floor';
  const defaultPeriod = 60 * 60;
  const defaultTimeRange = getTimerangeFromPeriod(defaultPeriod);
  
  // Modify the body for the actual values we want to use
  if (
    // Overall default
    typeof body.startTime === 'undefined' &&
    typeof body.endTime === 'undefined' &&
    typeof body.period === 'undefined'
  ) {
    const nowHour = Math[dir]((Date.now() + timeZoneOffset) / ONE_HOUR) * ONE_HOUR - timeZoneOffset;
    body.startTime = nowHour - ONE_DAY;
    body.endTime = nowHour;
    body.period = 3600;
  } else if (
    // Period but one of startTime or endTime is missing
    typeof body.period !== 'undefined' &&
    (
      typeof body.startTime === 'undefined' ||
      typeof body.endTime === 'undefined'
    )
  ) {
    if (typeof body.timerange === 'undefined') {
      body.timerange = getTimerangeFromPeriod(body.period);
    }

    if (typeof body.startTime !== 'undefined') {
      body.endTime = body.startTime + body.timerange * 1000;
    } else if (typeof body.endTime !== 'undefined') {
      body.startTime = body.endTime - body.timerange * 1000;
    } else {
      const nowTime = Math[dir]((Date.now() + timeZoneOffset) / (body.period * 1000))
        * body.period * 1000 - timeZoneOffset;
      body.endTime = nowTime;
      body.startTime = nowTime - body.timerange * 1000;
    }
  } else if (
    // Period missing but startTime or endTime (or both) are provided
    typeof body.period === 'undefined' &&
    (
      typeof body.startTime !== 'undefined' ||
      typeof body.endTime !== 'undefined'
    )
  ) {
    if (
      typeof body.startTime === 'undefined' ||
      typeof body.endTime === 'undefined'
    ) {
      body.timerange = defaultTimeRange;
    } else {
      body.timerange = Math.floor((body.endTime - body.startTime) / 1000);
    }
  }

  // Make sure we have defined period, startTime, and endTime
  if (
    typeof body.period === 'undefined' ||
    typeof body.startTime === 'undefined' ||
    typeof body.endTime === 'undefined'
  ) return [ 400, generateApi400Body([ 'times' ]) ];
  const fullBody: Required<Pick<GetMetricsApi['body'], 'startTime' | 'endTime' | 'period'>> = {
    period: body.period,
    startTime: body.startTime,
    endTime: body.endTime,
  };

  // Build the metrics request
  const metricRequest: GetMetricDataInput = {
    EndTime: new Date(fullBody.endTime),
    StartTime: new Date(fullBody.startTime),
    ScanBy: 'TimestampDescending',
    LabelOptions: {
      Timezone: timeZoneStr,
    },
    MetricDataQueries: [],
  };
  const includedMetrics: string[] = [];
  body.metrics.forEach(metric => {
    const key = buildMetricKey(metric);
    
    // Skip already included metrics
    if (includedMetrics.includes(key)) {
      metricRequest.MetricDataQueries.forEach(m => {
        if (m.Id === key && !m.ReturnData) {
          m.ReturnData = true;
        }
      });
      return;
    }

    // Handle each metric type
    switch (metric.type) {
      case 'lambda': {
        let metrics: MetricDataQueries | null = null;
        let keys: string[] | null = null;
        if (metric.fn in specialLambdaNames) {
          [ metrics, keys ] = buildSpecialLambdaMetric(metric, fullBody);
        } else {
          [ metrics, keys ] = buildLambdaMetric(metric, fullBody);
        }
        metrics.forEach((m, i) => {
          if (includedMetrics.includes(keys[i])) return;

          metricRequest.MetricDataQueries.push(m);
          includedMetrics.push(keys[i]);
        });
        break;
      }
      case 'tower': {
        const key = buildMetricKey(metric);
        if (includedMetrics.includes(key)) return;
        metricRequest.MetricDataQueries.push({
          Label: metric.label,
          Id: key,
          MetricStat: {
            Metric: {
              Namespace: 'DTR Metrics',
              MetricName: metric.metric,
              Dimensions: [{
                Name: 'Tower',
                Value: metric.tower,
              }],
            },
            Period: fullBody.period,
            Stat: metric.stat,
          },
        });
        includedMetrics.push(key);
        break;
      }
      case 'event': {
        const key = buildMetricKey(metric);
        if (includedMetrics.includes(key)) return;
        metricRequest.MetricDataQueries.push({
          Label: metric.label,
          Id: key,
          MetricStat: {
            Metric: {
              Namespace: metric.namespace,
              MetricName: metric.metricName,
              Dimensions: ([ 'action', 'source' ] as const).map(v => {
                if (typeof metric[v] === 'undefined') return null;

                return {
                  Name: v,
                  Value: metric[v],
                };
              }).filter(v => v !== null),
            },
            Period: fullBody.period,
            Stat: metric.stat || 'Sum',
          },
        });
        includedMetrics.push(key);
        break;
      }
    }
  });
  console.log(includedMetrics);

  const response: GetMetricsApi['responses'][200] = {
    startTime: body.startTime,
    endTime: body.endTime,
    period: body.period,
    labels: {},
    data: [],
  };
  if (metricRequest.MetricDataQueries.length === 0)
    return [ 200, response ];

  const data = await cloudwatch.getMetricData(metricRequest).promise();
  if (typeof data.MetricDataResults === 'undefined') {
    return [
      200,
      response,
    ];
  }

  // Pull out the data labels
  const labelArr: string[] = [];
  response.labels = data.MetricDataResults.reduce((
    agg: typeof response.labels,
    item
  ) => {
    const id = item.Id || 'ERR';
    const label = item.Label || 'ERR';
    if (!labelArr.includes(id)) {
      labelArr.push(id);
    }
    agg[`k${labelArr.indexOf(id)}`] = label;

    return agg;
  }, {});

  // Pull out the data
  data.MetricDataResults.forEach(item => {
    item.Timestamps?.forEach((ts, index) => {
      const tsString = ts.toISOString();
      const id = `k${labelArr.indexOf(item.Id || 'ERR')}`;
      const val = item.Values?.[index] || 0;
      const elem = response.data.find(v => v.ts === tsString);
      if (elem) {
        elem.values[id] = val;
      } else {
        response.data.push({
          ts: tsString,
          values: {
            [id]: val,
          },
        });
      }
    })
  });

  return [ 200, response ];
}

export const main = handleResourceApi.bind(null, {
  POST,
});
