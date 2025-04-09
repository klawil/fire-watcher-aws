'use client';

import AdjacentSites from "@/components/adjacentSites/adjacentSites";
import StatusMetricLineChart from "@/components/statusChart/statusMetricLineChart";
import StatusTimingLineChart from "@/components/statusChart/statusTimingLineChart";
import StatusTowerLineChart from "@/components/statusChart/statusTowerLineChart";
import React, { useState } from "react";
import annotationPlugin from 'chartjs-plugin-annotation';
import {
  Chart as ChartJS,
  registerables,
} from 'chart.js';
import { ChartConfig } from "@/types/frontend/chart";

ChartJS.register(
  annotationPlugin,
  ...registerables,
);

const maxParallelCharts = 5;
const lineChartsToShow: ChartConfig[] = [
  {
    type: 'Tower',
    title: 'Saguache Tower Status',
    body: {
      metrics: [{
        type: 'tower',
        label: 'Maximum',
        tower: 'Saguache',
        metric: 'Decode Rate',
        stat: 'Maximum',
      }, {
        type: 'tower',
        label: 'Minimum',
        tower: 'Saguache',
        metric: 'Decode Rate',
        stat: 'Minimum',
      }, {
        type: 'tower',
        label: 'Uploads',
        tower: 'Saguache',
        metric: 'UploadTime',
        stat: 'SampleCount',
      }],
      period: 300,
      timerange: 86400000,
      live: 'y',
    },
  },
  {
    type: 'Tower',
    title: 'Pool Table Status',
    body: {
      metrics: [{
        type: 'tower',
        label: 'Maximum',
        tower: 'PoolTable',
        metric: 'Decode Rate',
        stat: 'Maximum',
      }, {
        type: 'tower',
        label: 'Minimum',
        tower: 'PoolTable',
        metric: 'Decode Rate',
        stat: 'Minimum',
      }, {
        type: 'tower',
        label: 'Uploads',
        tower: 'PoolTable',
        metric: 'UploadTime',
        stat: 'SampleCount',
      }],
      period: 300,
      timerange: 86400000,
      live: 'y',
    },
  },
  {
    type: 'Tower',
    title: 'San Antonio Peak Status',
    lazyLoad: true,
    body: {
      metrics: [{
        type: 'tower',
        label: 'Maximum',
        tower: 'SanAntonio',
        metric: 'Decode Rate',
        stat: 'Maximum',
      }, {
        type: 'tower',
        label: 'Minimum',
        tower: 'SanAntonio',
        metric: 'Decode Rate',
        stat: 'Minimum',
      }, {
        type: 'tower',
        label: 'Uploads',
        tower: 'SanAntonio',
        metric: 'UploadTime',
        stat: 'SampleCount',
      }],
      period: 300,
      timerange: 86400000,
      live: 'y',
    },
  },
  {
    type: 'Metric',
    title: 'VHF Recorder Pings',
    unit: 'Count',
    body: {
      period: 300,
      timerange: 86400000,
      metrics: [{
        type: 'event',
        label: 'Home Server',
        namespace: 'VHF Metrics',
        metricName: '120-home',
      }, {
        type: 'event',
        label: 'CVFD Server',
        namespace: 'VHF Metrics',
        metricName: 'cvfd-station',
      }],
    },
  },
  {
    type: 'Metric',
    title: 'Files Uploaded',
    lazyLoad: true,
    unit: 'Count',
    body: {
      metrics: [{
        type: 'tower',
        label: 'Saguache Tower Uploads',
        tower: 'Saguache',
        metric: 'UploadTime',
        stat: 'SampleCount',
      }, {
        type: 'tower',
        label: 'Pool Table Uploads',
        tower: 'PoolTable',
        metric: 'UploadTime',
        stat: 'SampleCount',
      }, {
        type: 'tower',
        label: 'San Antonio Peak Uploads',
        tower: 'SanAntonio',
        metric: 'UploadTime',
        stat: 'SampleCount',
      }, {
        type: 'event',
        label: 'VHF Uploads',
        namespace: 'CVFD API',
        metricName: 'Call',
        source: 'S3',
        action: 'createVHF',
      }],
      live: 'y',
    },
  },
  {
    type: 'Metric',
    title: 'Text Counts',
    unit: 'Count',
    body: {
      metrics: [{
        type: 'event',
        label: 'Initiated',
        namespace: 'Twilio Health',
        metricName: 'Initiated',
      }, {
        type: 'event',
        label: 'Sent',
        namespace: 'Twilio Health',
        metricName: 'SentTime',
        stat: 'SampleCount',
      }, {
        type: 'event',
        label: 'Delivered',
        namespace: 'Twilio Health',
        metricName: 'DeliveredTime',
        stat: 'SampleCount',
      }],
      period: 86400,
      timerange: 2419200000,
      live: 'y',
    },
  },

  // {
  //   type: 'Timing',
  //   title: 'Text Times',
	// 	dataUrl: 'metrics=twilio-page-duration,twilio-page-time,twilio-sent-time,twilio-delivered-sent-time&period=86400&timerange=2419200000&live=y',
  //   convertValue: val => val > 300000 ? 300 : Math.ceil(val / 1000),
  // },

  {
    type: 'Metric',
    unit: 'Seconds',
    title: 'Upload Delay',
    body: {
      metrics: [{
        type: 'tower',
        label: 'Saguache Tower',
        tower: 'Saguache',
        metric: 'UploadTime',
        stat: 'p50',
      }, {
        type: 'tower',
        label: 'Pool Table',
        tower: 'PoolTable',
        metric: 'UploadTime',
        stat: 'p50',
      }, {
        type: 'tower',
        label: 'San Antonio',
        tower: 'SanAntonio',
        metric: 'UploadTime',
        stat: 'p50',
      }],
    },
  },
  {
    type: 'Metric',
    title: 'API Calls',
    body: {
      metrics: [{
        type: 'lambda',
        fn: 'all_A',
        metric: 'Invocations',
        stat: 'Sum',
      }],
    },
    unit: 'Count',
  },
  {
    type: 'Metric',
    title: 'API Errors',
    body: {
      metrics: [{
        type: 'lambda',
        fn: 'all_A',
        metric: 'Errors',
        stat: 'Sum',
      }],
    },
    unit: 'Count',
  },
  {
    type: 'Metric',
    lazyLoad: true,
    title: 'API Durations (average)',
    body: {
      metrics: [{
        type: 'lambda',
        fn: 'all_A',
        metric: 'Duration',
        stat: 'p50',
      }],
    },
    unit: 'Milliseconds',
  },
  {
    type: 'Metric',
    lazyLoad: true,
    title: 'API Durations (max)',
    body: {
      metrics: [{
        type: 'lambda',
        fn: 'all_A',
        metric: 'Duration',
        stat: 'Maximum',
      }],
    },
    unit: 'Milliseconds',
  },
  {
    type: 'Metric',
    title: 'Infrastructure Calls',
    body: {
      metrics: [{
        type: 'lambda',
        fn: 'all_I',
        metric: 'Invocations',
        stat: 'Sum',
      }],
    },
    unit: 'Count',
  },
  {
    type: 'Metric',
    title: 'Infrastructure Errors',
    body: {
      metrics: [{
        type: 'lambda',
        fn: 'all_I',
        metric: 'Errors',
        stat: 'Sum',
      }],
    },
    unit: 'Count',
  },
  {
    type: 'Metric',
    title: 'Infrastructure Durations (average)',
    lazyLoad: true,
    body: {
      metrics: [{
        type: 'lambda',
        fn: 'all_I',
        metric: 'Duration',
        stat: 'p50',
      }],
    },
    unit: 'Milliseconds',
  },
  {
    type: 'Metric',
    lazyLoad: true,
    title: 'Infrastructure Durations (max)',
    body: {
      metrics: [{
        type: 'lambda',
        fn: 'all_I',
        metric: 'Duration',
        stat: 'Maximum',
      }],
    },
    unit: 'Milliseconds',
  },
];

export default function StatusPage() {
  const [chartLoadedCount, setChartLoadedCount] = useState(0);
  let notLazyCount = 0;

  return (<>
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
      </React.Fragment>
    })}
  </>)
}
