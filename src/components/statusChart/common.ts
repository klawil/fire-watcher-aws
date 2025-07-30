'use client';

import { ChartDataset } from 'chart.js';
import {
  Dispatch, SetStateAction, useContext, useEffect, useState
} from 'react';

import { GetMetricsApi } from '@/types/api/metrics';
import { AddAlertContext } from '@/utils/frontend/clientContexts';
import { typeFetch } from '@/utils/frontend/typeFetch';

type ApiLabels = GetMetricsApi['responses'][200]['labels'];
type ApiData = GetMetricsApi['responses'][200]['data'];

type TimeFormatFn = (a: Date) => string;

const timezone = 'America/Denver';

const formatHour: TimeFormatFn = date => date.toLocaleTimeString('en-US', {
  timeZone: timezone,
  hour12: false,
  hour: '2-digit',
  minute: '2-digit',
});
const formatDayHour: TimeFormatFn = date => {
  const dateString = date.toLocaleDateString('en-us', {
    timeZone: timezone,
    weekday: 'short',
  });
  let timeString = date.toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });

  if (timeString === '24:00') {
    timeString = '00:00';
  }

  return `${dateString} ${timeString}`;
};
const formatDateHour: TimeFormatFn = date => {
  const dateString = date.toLocaleDateString('en-us', {
    timeZone: timezone,
    month: 'short',
    day: '2-digit',
  });
  let timeString = date.toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });

  if (timeString === '24:00') {
    timeString = '00:00';
  }

  return `${dateString} ${timeString}`;
};
const formatDay: TimeFormatFn = date => date.toLocaleDateString('en-us', {
  timeZone: timezone,
  weekday: 'short',
  month: 'short',
  day: '2-digit',
});
const formatDate: TimeFormatFn = date => date.toLocaleDateString('en-us', {
  timeZone: timezone,
  month: 'short',
  day: '2-digit',
});

// All values in milliseconds
const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = ONE_HOUR * 24;
const ONE_WEEK = ONE_DAY * 7;
const ONE_MONTH = ONE_WEEK * 4;
const ONE_YEAR = ONE_DAY * 365;

function generatePeriodFormatter(hour: TimeFormatFn, day: TimeFormatFn): {
  period: number;
  formatter: TimeFormatFn;
}[] {
  return [
    {
      period: ONE_DAY,
      formatter: day,
    },
    {
      period: ONE_HOUR * 12,
      formatter: hour,
    },
  ];
}

const rangeSizeFormatters: {
  range: number;
  periods: {
    period: number;
    formatter: TimeFormatFn;
  }[];
}[] = [
  {
    range: ONE_YEAR,
    periods: generatePeriodFormatter(formatDateHour, formatDate),
  },
  {
    range: ONE_MONTH,
    periods: generatePeriodFormatter(formatDateHour, formatDate),
  },
  {
    range: ONE_WEEK,
    periods: generatePeriodFormatter(formatDayHour, formatDay),
  },
  {
    range: ONE_DAY,
    periods: generatePeriodFormatter(formatHour, formatDay),
  },
];

async function getDataBody(body: GetMetricsApi['body']): Promise<[
  ApiLabels,
  ApiData,
  {
    startTime: number;
    endTime: number;
    period: number;
  }
]> {
  const [
    code,
    resp,
  ] = await typeFetch<GetMetricsApi>({
    path: '/api/v2/metrics/',
    method: 'POST',
    body: {
      ...body,
      live: 'y',
    },
  });

  if (
    code !== 200 ||
    resp === null ||
    'message' in resp
  ) {
    console.error(code, resp);
    throw new Error('Unable to fetch API');
  }

  return [
    resp.labels,
    resp.data,
    resp,
  ];
}

export function useChartData(
  body: GetMetricsApi['body'],
  shouldLoad: boolean,
  setChartLoaded: Dispatch<SetStateAction<number>>,
  returnNonData: boolean,
  convertValue: (a: number) => number = v => v
): [
  {
    labels: string[];
    datasets: ChartDataset<'line', number[]>[];
  } | null | undefined,
  () => void
  ] {
  const [
    data,
    setData,
  ] = useState<{
    labels: string[];
    datasets: ChartDataset<'line', number[]>[];
  } | null | undefined>(undefined);
  const resetData = () => setData(undefined);
  const addAlert = useContext(AddAlertContext);

  const [
    isLoading,
    setIsLoading,
  ] = useState(false);
  useEffect(() => {
    if (typeof data !== 'undefined' || isLoading || !shouldLoad) {
      return;
    }

    (async () => {
      setIsLoading(true);
      try {
        const [
          names,
          data,
          newData,
        ] = await getDataBody(body);

        const chartData: {
          [key: string]: {
            [key: string]: number;
          };
        } = {};
        const labels: string[] = [];

        for (let t = newData.startTime; t < newData.endTime; t += newData.period * 1000) {
          const dateStr = new Date(t).toISOString();
          chartData[dateStr] = {};
          labels.push(dateStr);
        }

        data.forEach(item => {
          Object.keys(names)
            .forEach(key => chartData[item.ts][key] = item.values[key] || 0);
        });

        labels.forEach(label => Object.keys(names)
          .forEach(key => {
            chartData[label][key] = convertValue(chartData[label][key] || 0);
          }));

        const dataRange = newData.endTime - newData.startTime;
        const formatter = rangeSizeFormatters.reduce((f, val) => {
          if (dataRange <= val.range) {
            return val.periods.reduce((f, val) => {
              if (newData.period * 1000 <= val.period) {
                return val.formatter;
              }

              return f;
            }, f);
          }

          return f;
        }, formatDay);

        const datasets: ChartDataset<'line', number[]>[] = Object.keys(names)
          .map(key => ({
            label: names[key],
            data: labels.map(label => chartData[label][key]),
            fill: false,
            pointStyle: false,
          } as const))
          .filter(dataset => returnNonData || dataset.data.some(v => v !== 0));

        setData({
          labels: labels.map(label => formatter(new Date(label))),
          datasets,
        });
      } catch (e) {
        setData(null);
        console.error(`Failed to load chart (${body})`, e);
        addAlert('danger', 'Failed to load data for a chart');
      }
      setChartLoaded(v => v + 1);
      setIsLoading(false);
    })();
  }, [
    shouldLoad,
    body,
    data,
    isLoading,
    setChartLoaded,
    convertValue,
    addAlert,
    returnNonData,
  ]);

  return [
    data,
    resetData,
  ];
}

export function usePageSize() {
  const [
    winWidth,
    setWinWidth,
  ] = useState<null | number>(null);
  const [
    winHeight,
    setWinHeight,
  ] = useState<null | number>(null);

  useEffect(() => {
    const resizeListen = () => {
      setWinWidth(window.document.documentElement.clientWidth);
      setWinHeight(window.document.documentElement.clientHeight);
    };
    window.addEventListener('resize', resizeListen);
    resizeListen();
    return () => window.removeEventListener('resize', resizeListen);
  }, []);

  return [
    winWidth,
    winHeight,
  ];
}
