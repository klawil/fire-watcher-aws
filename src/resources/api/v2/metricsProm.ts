import { Sha256 } from '@aws-crypto/sha256-js';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import { HttpRequest } from '@aws-sdk/protocol-http';
import { SignatureV4 } from '@aws-sdk/signature-v4';

import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';
import {
  parseJsonBody
} from './_utils';

import {
  api401Body, api403Body,
  generateApi400Body
} from '@/types/api/_shared';
import {
  GetPromMetricsApi
} from '@/types/api/metrics';
import {
  LogLevel,
  getLogger
} from '@/utils/common/logger';

const logger = getLogger('metricsProm');

async function queryCloudWatchPromQL(query: string, win: {
  start: number;
  end: number;
  step: number; // in seconds
}, label: string) {
  const endpoint = new URL('https://monitoring.us-east-2.amazonaws.com/api/v1/query_range');

  const httpRequest = new HttpRequest({
    hostname: endpoint.hostname,
    path: endpoint.pathname + endpoint.search,
    protocol: endpoint.protocol,
    method: 'POST',
    body: new URLSearchParams({
      query,
      start: new Date(win.start).toISOString(),
      end: new Date(win.end).toISOString(),
      step: `${win.step}`,
    }).toString(),
    headers: {
      host: endpoint.host,
      'content-type': 'application/x-www-form-urlencoded',
    },
  });

  const signer = new SignatureV4({
    credentials: defaultProvider(),
    region: 'us-east-2',
    service: 'monitoring',
    sha256: Sha256,
  });

  const signedRequest = await signer.sign(httpRequest);

  // Convert Node/Fetch and execute request
  const response = await fetch(`https://${signedRequest.hostname}${signedRequest.path}`, {
    method: signedRequest.method,
    headers: signedRequest.headers,
    body: signedRequest.body,
  });

  const value = await response.json();
  logger.info(`Querying CloudWatch PromQL with query: ${query}, window: ${JSON.stringify(win)}, label: ${label}, result: ${response.status}`);
  logger.info(`Results: ${JSON.stringify(value)}`);

  return {
    label,
    data: value.data.result[0].values,
  };
}

const periodToTime: {
  period: number; // seconds
  timerange: number; // milliseconds
}[] = [
  {
    timerange: 365 * 24 * 60 * 60, // 365 days (1 year)
    period: 24 * 60 * 60, // 24 hours
  },
  {
    timerange: 28 * 24 * 60 * 60, // 28 days (1 month)
    period: 6 * 60 * 60, // 6 hours
  },
  {
    timerange: 7 * 24 * 60 * 60, // 7 days
    period: 60 * 60, // 1 hour
  },
  {
    timerange: 24 * 60 * 60, // 24 hours
    period: 15 * 60, // 15 minutes
  },
  {
    timerange: 6 * 60 * 60, // 6 hours
    period: 5 * 60, // 5 minutes
  },
  {
    timerange: 60 * 60, // 1 hour
    period: 60, // 1 minute
  },
];

function getPeriodFromTimerange(timerange: number) {
  return periodToTime.reduce((period, item) => {
    if (timerange <= item.timerange) {
      return item.period;
    }

    return period;
  }, periodToTime[0].period);
}
function getTimerangeFromPeriod(period: number) {
  return periodToTime.reduce((timerange, item) => {
    if (period <= item.period) {
      return item.timerange;
    }

    return timerange;
  }, periodToTime[0].timerange);
}

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

const POST: LambdaApiFunction<GetPromMetricsApi> = async function (event, user, userPerms) {
  logger.trace('POST', ...arguments);
  logger.setLevel(LogLevel.Info);

  // Authorize the user
  if (user === null) {
    return [
      401,
      api401Body,
    ];
  }
  if (!userPerms.isAdmin) {
    return [
      403,
      api403Body,
    ];
  }

  const [ body, ] = parseJsonBody<GetPromMetricsApi['body']>(event.body);
  if (body === null) {
    return [
      400,
      generateApi400Body([]),
    ];
  }
  if (body.metrics.length === 0) {
    return [
      400,
      generateApi400Body([ 'No metrics', ]),
    ];
  }

  // Get the timezone information
  const nowDate = new Date();
  const timeZoneOffset = new Date(nowDate.toLocaleString('en-US', { timeZone: 'America/Denver', })).getTime() -
    new Date(nowDate.toLocaleString('en-US', { timeZone: 'UTC', })).getTime();

  // Check for a timerange but not period being provided
  if (
    typeof body.timerange !== 'undefined' &&
    typeof body.period === 'undefined'
  ) {
    body.period = getPeriodFromTimerange(body.timerange);
  }

  // Build the default time values and direction to expand the values
  const dir = 'floor';
  const defaultPeriod = 60 * 60;
  const defaultTimeRange = getTimerangeFromPeriod(defaultPeriod);

  // Modify the body for the actual values we want to use
  if (
    // Overall default
    typeof body.startTime === 'undefined' &&
    typeof body.endTime === 'undefined' &&
    typeof body.period === 'undefined'
  ) {
    const nowHour = (Math[dir](
      (Date.now() + timeZoneOffset) / ONE_HOUR
    ) * ONE_HOUR) - timeZoneOffset;
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
      body.endTime = body.startTime + (body.timerange * 1000);
    } else if (typeof body.endTime !== 'undefined') {
      body.startTime = body.endTime - (body.timerange * 1000);
    } else {
      const nowTime = (
        Math[dir]((Date.now() + timeZoneOffset) / (body.period * 1000)) *
        (body.period * 1000)
      ) - timeZoneOffset;
      body.endTime = nowTime;
      body.startTime = nowTime - (body.timerange * 1000);
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
  ) {
    return [
      400,
      generateApi400Body([ 'times', ]),
    ];
  }
  const fullBody: Required<Pick<GetPromMetricsApi['body'], 'startTime' | 'endTime' | 'period'>> = {
    period: body.period,
    startTime: body.startTime,
    endTime: body.endTime,
  };

  // Build the windows for each metric
  const metricWindows: {
    start: number;
    end: number;
    step: number; // in seconds
  }[] = [];
  for (let i = fullBody.startTime; i < fullBody.endTime; i += ONE_DAY * 7) {
    metricWindows.push({
      start: i,
      end: Math.min(i + (ONE_DAY * 7), fullBody.endTime),
      step: fullBody.period,
    });
  }

  // Build the metrics request
  const queries: {
    query: string;
    label: string;
  }[] = body.metrics.map(metric => {
    let query: string = '';
    if (metric.function) {
      query += `${metric.function.name}(`;
      if (metric.function.quantile) {
        query += `${metric.function.quantile},`;
      }
    }
    query += `${metric.metric}`;
    if (metric.conditions && metric.conditions.length > 0) {
      query += '{';
      query += metric.conditions.map(condition => {
        return `"${condition.label}"${condition.operator || '='}"${condition.value}"`;
      }).join(',');
      query += '}';
    }
    if (metric.function) {
      if (metric.function.windowed) {
        query += `[${fullBody.period}s]`;
      }
      query += ')';
    }
    return {
      query,
      label: metric.label,
    };
  });

  // Make the HTTP requests
  const promises: Promise<{
    label: string;
    data: [number, string][];
  }>[] = [];
  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    for (let w = 0; w < metricWindows.length; w++) {
      const win = metricWindows[w];
      promises.push(queryCloudWatchPromQL(query.query, win, query.label));
    }
  }

  // Wait for all the metric queries to complete
  const results = await Promise.all(promises);

  // Create the labels
  let labelIdx: number = 0;
  const labelMap: { [key: string]: string } = {};
  const resultsByLabel: { [key: string]: [number, string][] } = {};
  results.forEach(result => {
    if (!labelMap[result.label]) {
      labelMap[result.label] = `k${labelIdx++}`;
    }
    if (!resultsByLabel[result.label]) {
      resultsByLabel[result.label] = [];
    }
    resultsByLabel[result.label].push(...result.data);
  });

  // Consolidate the results by timestamp
  const consolidatedResults: {
    ts: string;
    values: {
      [key: string]: number;
    };
  }[] = [];
  results
    .map(result => result.data.map(item => item[0]))
    .flat()
    .filter((v, i, a) => a.indexOf(v) === i)
    .sort()
    .map(v => ({
      ts: new Date(v * 1000).toISOString(),
      v,
    }))
    .forEach(timestamp => {
      const item: {
        ts: string;
        values: {
          [key: string]: number;
        };
      } = {
        ts: timestamp.ts,
        values: {},
      };

      // Get the values for each label
      Object.keys(labelMap).forEach(label => {
        const v = (resultsByLabel[label] || []).find(v => v[0] === timestamp.v);
        if (v) {
          item.values[labelMap[label]] = parseFloat(v[1]);
        // } else {
        //   item.values[labelMap[label]] = 0;
        }
      });

      consolidatedResults.push(item);
    });

  const newLabelMap: { [key: string]: string } = {};
  Object.keys(labelMap).forEach(label => {
    newLabelMap[labelMap[label]] = label;
  });

  return [
    200,
    {
      startTime: fullBody.startTime,
      endTime: fullBody.endTime,
      period: fullBody.period,
      labels: newLabelMap,
      data: consolidatedResults,
    },
  ];
};

export const main = handleResourceApi.bind(null, {
  POST,
});
