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
const formatDayHour: TimeFormatFn = date => {
  const dateString = date.toLocaleDateString('en-us', {
    timeZone: 'America/Denver',
    weekday: 'short',
  });
  let timeString = date.toLocaleTimeString('en-US', {
    timeZone: 'America/Denver',
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
) {
  const [
    data,
    setData,
  ] = useState<{
    labels: string[];
    datasets: ChartDataset<'line', number[]>[];
  } | null | undefined>(undefined);
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

        const formatter = periodFormatters.reduce((f, val) => {
          if (newData.period <= val.period) {
            return val.formatter;
          }

          return f;
        }, periodFormatters[periodFormatters.length - 1].formatter);

        const datasets: ChartDataset<'line', number[]>[] = Object.keys(names)
          .map(key => ({
            label: names[key],
            stepped: true,
            data: labels.map(label => chartData[label][key]),
            fill: false,
            tension: 0.1,
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

  return data;
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
