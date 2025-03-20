'use client';

import { ApiFrontendStatsResponse } from "$/frontendApi";
import { ChartDataset } from "chart.js";
import { Dispatch, SetStateAction, useEffect, useState } from "react";

type TimeFormatFn = (a: Date) => string;
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

export function useChartData(
  dataUrl: string,
  shouldLoad: boolean,
  setChartLoaded: Dispatch<SetStateAction<number>>,
  convertValue: (a: number) => number,
) {
  const [data, setData] = useState<{
    labels: string[];
    datasets: ChartDataset<"line", number[]>[];
  } | null | undefined>(undefined);

  const [isLoading, setIsLoading] = useState(false);
  useEffect(() => {
    if (typeof data !== 'undefined' || isLoading || !shouldLoad) return;

    (async () => {
      setIsLoading(true);
      try {
        const newData: ApiFrontendStatsResponse = await fetch(`/api/frontend?action=stats&${dataUrl}`)
          .then(r => r.json());

        if (newData.success) {
          const data = newData.data;
          const names = data.names;
          const chartData: {
            [key: string]: {
              [key: string]: number;
            };
          } = {};
          const labels: string[] = [];

          for (let t = newData.startTime; t < newData.endTime; t += (newData.period * 1000)) {
            const dateStr = new Date(t).toISOString();
            chartData[dateStr] = {};
            labels.push(dateStr);
          }

          data.data.forEach(item => {
            Object.keys(names)
              .forEach(key => chartData[item.ts][key] = item.values[key] || 0);
          });

          labels.forEach(label => Object.keys(names)
            .forEach(key => {
              chartData[label][key] = convertValue(chartData[label][key] || 0);
            }));

          const formatter = periodFormatters.reduce((f, val) => {
            if (newData.period <= val.period) return val.formatter;
      
            return f;
          }, periodFormatters[periodFormatters.length - 1].formatter);

          const datasets: ChartDataset<"line", number[]>[] = Object.keys(names)
            .map(key => ({
              label: names[key],
              data: labels.map(label => chartData[label][key]),
              fill: false,
              tension: 0.1,
              pointStyle: false,
            }));

          setData({
            labels: labels.map(label => formatter(new Date(label))),
            datasets,
          });
        } else {
          setData(null);
        }

        if (!newData.success) throw newData;
      } catch (e) {
        console.error(`Failed to load chart (${dataUrl})`, e);
      }
      setChartLoaded(v => v + 1);
      setIsLoading(false);
    })();
  }, [shouldLoad, data, isLoading, dataUrl, setChartLoaded, convertValue]);

  return data;
}

export function usePageWidth() {
  const [winWidth, setWinWidth] = useState<null | number>(null);

  useEffect(() => {
    const resizeListen = () => setWinWidth(window.document.documentElement.clientWidth);
    window.addEventListener('resize', resizeListen);
    resizeListen();
    return () => window.removeEventListener('resize', resizeListen);
  }, []);

  return winWidth;
}
