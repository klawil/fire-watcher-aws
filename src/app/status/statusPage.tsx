'use client';

import {
  Chart as ChartJS,
  registerables
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import React, { useState } from 'react';

import AdjacentSites from '@/components/adjacentSites/adjacentSites';
import StatusMetricLineChart from '@/components/statusChart/statusMetricLineChart';
import StatusTimingLineChart from '@/components/statusChart/statusTimingLineChart';
import StatusTowerLineChart from '@/components/statusChart/statusTowerLineChart';
import { ChartConfig } from '@/types/frontend/chart';

ChartJS.register(
  annotationPlugin,
  ...registerables
);

// All values in seconds
const FIVE_MINUTES = 5 * 60;
const ONE_DAY = 60 * 60 * 24;
const ONE_MONTH = ONE_DAY * 28;

const maxParallelCharts = 5;
const lineChartsToShow: ChartConfig[] = [

  /** Recorder Metrics **/
  {
    type: 'Tower',
    title: 'Saguache Tower Status',
    body: {
      metrics: [
        {
          type: 'timing',
          label: 'Maximum',
          namespace: 'DTR Metrics',
          metricName: 'Decode Rate',
          tower: 'Saguache',
          stat: 'Maximum',
        },
        {
          type: 'timing',
          label: 'Minimum',
          namespace: 'DTR Metrics',
          metricName: 'Decode Rate',
          tower: 'Saguache',
          stat: 'Minimum',
        },
        {
          type: 'timing',
          label: 'Uploads',
          namespace: 'DTR Metrics',
          metricName: 'UploadTime',
          tower: 'Saguache',
          stat: 'SampleCount',
        },
      ],
      period: FIVE_MINUTES,
      timerange: ONE_DAY,
      live: 'y',
    },
  },
  {
    type: 'Tower',
    title: 'Pool Table Status',
    body: {
      metrics: [
        {
          type: 'timing',
          label: 'Maximum',
          namespace: 'DTR Metrics',
          metricName: 'Decode Rate',
          tower: 'PoolTable',
          stat: 'Maximum',
        },
        {
          type: 'timing',
          label: 'Minimum',
          namespace: 'DTR Metrics',
          metricName: 'Decode Rate',
          tower: 'PoolTable',
          stat: 'Minimum',
        },
        {
          type: 'timing',
          label: 'Uploads',
          namespace: 'DTR Metrics',
          metricName: 'UploadTime',
          tower: 'PoolTable',
          stat: 'SampleCount',
        },
      ],
      period: FIVE_MINUTES,
      timerange: ONE_DAY,
      live: 'y',
    },
  },
  {
    type: 'Tower',
    title: 'San Antonio Peak Status',
    lazyLoad: true,
    body: {
      metrics: [
        {
          type: 'timing',
          label: 'Maximum',
          namespace: 'DTR Metrics',
          metricName: 'Decode Rate',
          tower: 'SanAntonio',
          stat: 'Maximum',
        },
        {
          type: 'timing',
          label: 'Minimum',
          namespace: 'DTR Metrics',
          metricName: 'Decode Rate',
          tower: 'SanAntonio',
          stat: 'Minimum',
        },
        {
          type: 'timing',
          label: 'Uploads',
          namespace: 'DTR Metrics',
          metricName: 'UploadTime',
          tower: 'SanAntonio',
          stat: 'SampleCount',
        },
      ],
      period: FIVE_MINUTES,
      timerange: ONE_DAY,
      live: 'y',
    },
  },
  {
    type: 'Metric',
    title: 'VHF Recorder Pings',
    unit: 'Count',
    body: {
      period: FIVE_MINUTES,
      timerange: ONE_DAY,
      metrics: [
        {
          type: 'count',
          label: 'Home Server',
          namespace: 'VHF Metrics',
          metricName: '120-home',
        },
        {
          type: 'count',
          label: 'CVFD Server',
          namespace: 'VHF Metrics',
          metricName: 'cvfd-station',
        },
      ],
    },
  },
  {
    type: 'Metric',
    title: 'Files Uploaded',
    lazyLoad: true,
    unit: 'Count',
    body: {
      metrics: [
        {
          type: 'timing',
          label: 'Saguache Tower Uploads',
          namespace: 'DTR Metrics',
          metricName: 'UploadTime',
          tower: 'Saguache',
          stat: 'SampleCount',
        },
        {
          type: 'timing',
          label: 'Pool Table Uploads',
          namespace: 'DTR Metrics',
          metricName: 'UploadTime',
          tower: 'PoolTable',
          stat: 'SampleCount',
        },
        {
          type: 'timing',
          label: 'San Antonio Peak Uploads',
          namespace: 'DTR Metrics',
          metricName: 'UploadTime',
          tower: 'SanAntonio',
          stat: 'SampleCount',
        },
        {
          type: 'count',
          label: 'VHF Uploads',
          namespace: 'CVFD API',
          metricName: 'Call',
          source: 'S3',
          action: 'createVHF',
        },
      ],
      live: 'y',
    },
  },
  {
    type: 'Metric',
    unit: 'Seconds',
    title: 'Upload Delay',
    body: {
      metrics: [
        {
          type: 'timing',
          label: 'Saguache Tower',
          namespace: 'DTR Metrics',
          metricName: 'UploadTime',
          tower: 'Saguache',
          stat: 'p50',
        },
        {
          type: 'timing',
          label: 'Pool Table',
          namespace: 'DTR Metrics',
          metricName: 'UploadTime',
          tower: 'PoolTable',
          stat: 'p50',
        },
        {
          type: 'timing',
          label: 'San Antonio Peak',
          namespace: 'DTR Metrics',
          metricName: 'UploadTime',
          tower: 'SanAntonio',
          stat: 'p50',
        },
      ],
    },
  },

  /** Twilio Metrics **/
  {
    type: 'Metric',
    title: 'Text Counts',
    unit: 'Count',
    body: {
      metrics: [
        {
          type: 'count',
          label: 'Initiated',
          namespace: 'Twilio Health',
          metricName: 'Initiated',
        },
        {
          type: 'timing',
          label: 'Sent',
          namespace: 'Twilio Health',
          metricName: 'SentTime',
          stat: 'SampleCount',
        },
        {
          type: 'timing',
          label: 'Delivered',
          namespace: 'Twilio Health',
          metricName: 'DeliveredTime',
          stat: 'SampleCount',
        },
      ],
      period: ONE_DAY,
      timerange: ONE_MONTH,
      live: 'y',
    },
  },
  {
    type: 'Timing',
    title: 'Text Times',
    body: {
      metrics: [
        {
          type: 'timing',
          label: 'Page Duration',
          namespace: 'Twilio Health',
          metricName: 'PageDuration',
          stat: 'p80',
        },
        {
          type: 'timing',
          label: 'Page at Server',
          namespace: 'Twilio Health',
          metricName: 'PageToQueue',
          stat: 'p80',
        },
        {
          type: 'timing',
          label: 'Message Sent',
          namespace: 'Twilio Health',
          metricName: 'SentTime',
          stat: 'p80',
        },
        {
          type: 'timing',
          label: 'Message Delivered',
          namespace: 'Twilio Health',
          metricName: 'DeliveredTime',
          stat: 'p80',
        },
      ],
      period: ONE_DAY,
      timerange: ONE_MONTH,
      live: 'y',
    },
    convertValue: v => v > 300000 ? 300000 : v,
  },

  /** Lambda Metrics **/
  {
    type: 'Metric',
    title: 'Infrastructure Errors',
    body: {
      metrics: [ {
        type: 'lambda',
        fn: 'all_I',
        metric: 'Errors',
        stat: 'Sum',
      }, ],
    },
    unit: 'Count',
  },
  {
    type: 'Metric',
    title: 'API Errors',
    body: {
      metrics: [ {
        type: 'lambda',
        fn: 'all_A',
        metric: 'Errors',
        stat: 'Sum',
      }, ],
    },
    unit: 'Count',
  },
  {
    type: 'Metric',
    title: 'Infrastructure Calls',
    body: {
      metrics: [ {
        type: 'lambda',
        fn: 'all_I',
        metric: 'Invocations',
        stat: 'Sum',
      }, ],
    },
    unit: 'Count',
  },
  {
    type: 'Metric',
    title: 'API Calls',
    lazyLoad: true,
    body: {
      metrics: [ {
        type: 'lambda',
        fn: 'all_A',
        metric: 'Invocations',
        stat: 'Sum',
      }, ],
    },
    unit: 'Count',
  },
  {
    type: 'Metric',
    title: 'Infrastructure Durations (average)',
    lazyLoad: true,
    body: {
      metrics: [ {
        type: 'lambda',
        fn: 'all_I',
        metric: 'Duration',
        stat: 'p50',
      }, ],
    },
    unit: 'Milliseconds',
  },
  {
    type: 'Metric',
    lazyLoad: true,
    title: 'API Durations (average)',
    body: {
      metrics: [ {
        type: 'lambda',
        fn: 'all_A',
        metric: 'Duration',
        stat: 'p50',
      }, ],
    },
    unit: 'Milliseconds',
  },
  {
    type: 'Metric',
    title: 'Infrastructure Durations (max)',
    lazyLoad: true,
    body: {
      metrics: [ {
        type: 'lambda',
        fn: 'all_I',
        metric: 'Duration',
        stat: 'Maximum',
      }, ],
    },
    unit: 'Milliseconds',
  },
  {
    type: 'Metric',
    lazyLoad: true,
    title: 'API Durations (max)',
    body: {
      metrics: [ {
        type: 'lambda',
        fn: 'all_A',
        metric: 'Duration',
        stat: 'Maximum',
      }, ],
    },
    unit: 'Milliseconds',
  },
];

export default function StatusPage() {
  const [
    chartLoadedCount,
    setChartLoadedCount,
  ] = useState(0);
  let notLazyCount = 0;

  return <>
    <AdjacentSites />

    {lineChartsToShow.map((chart, idx) => {
      if (!chart.lazyLoad) {
        notLazyCount++;
      }

      const config = {
        shouldFetchData: notLazyCount <= chartLoadedCount + maxParallelCharts,
        setChartLoaded: setChartLoadedCount,
        ...chart,
      };
      return <React.Fragment key={idx}>
        {config.type === 'Tower' && <StatusTowerLineChart {...config} />}
        {config.type === 'Metric' && <StatusMetricLineChart {...config} />}
        {config.type === 'Timing' && <StatusTimingLineChart {...config} />}
      </React.Fragment>;
    })}
  </>;
}
