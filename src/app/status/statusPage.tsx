'use client';

import {
  Chart as ChartJS,
  registerables
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import React, {
  useEffect, useState
} from 'react';
import Col from 'react-bootstrap/Col';

import AdjacentSites from '@/components/adjacentSites/adjacentSites';
import StatusMetricLineChart from '@/components/statusChart/statusMetricLineChart';
import StatusTimingLineChart from '@/components/statusChart/statusTimingLineChart';
import StatusTowerLineChart from '@/components/statusChart/statusTowerLineChart';
import { ChartConfig } from '@/types/frontend/chart';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('statusPage');

ChartJS.register(
  annotationPlugin,
  ...registerables
);

// All values in seconds
const ONE_MINUTE = 60;
const ONE_HOUR = ONE_MINUTE * 60;
const ONE_DAY = ONE_HOUR * 24;
const ONE_WEEK = ONE_DAY * 7;
const ONE_MONTH = ONE_WEEK * 4;

const maxParallelCharts = 5;
const lineChartsToShow: ChartConfig[] = [

  /** Recorder Metrics **/
  { // Saguache Tower
    type: 'Tower',
    title: 'Saguache Tower Status',
    body: {
      period: ONE_HOUR,
      timerange: ONE_MONTH,
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
    },
  },
  { // Pool Table
    type: 'Tower',
    title: 'Pool Table Status',
    body: {
      period: ONE_HOUR,
      timerange: ONE_MONTH,
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
    },
  },
  { // San Antonio Peak
    type: 'Tower',
    title: 'San Antonio Peak Status',
    lazyLoad: true,
    body: {
      period: ONE_HOUR,
      timerange: ONE_MONTH,
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
    },
  },
  { // VHF Pings
    type: 'Metric',
    title: 'VHF Recorder Pings',
    unit: 'Count',
    body: {
      period: ONE_HOUR * 6,
      timerange: ONE_MONTH,
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
  { // Upload Count
    type: 'Metric',
    title: 'Files Uploaded',
    lazyLoad: true,
    unit: 'Count',
    body: {
      period: ONE_DAY,
      timerange: ONE_MONTH,
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
    },
  },
  { // Upload Delay
    type: 'Metric',
    unit: 'Seconds',
    title: 'Upload Delay',
    body: {
      period: ONE_DAY,
      timerange: ONE_MONTH,
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
  { // Text Counts
    type: 'Metric',
    title: 'Text Counts',
    unit: 'Count',
    body: {
      period: ONE_DAY,
      timerange: ONE_MONTH,
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
        {
          type: 'timing',
          label: 'Failed',
          namespace: 'Twilio Health',
          metricName: 'FailedTime',
          stat: 'SampleCount',
        },
      ],
    },
  },
  { // Text Times (Non Transcript)
    type: 'Timing',
    title: 'Text Times',
    body: {
      period: ONE_DAY,
      timerange: ONE_MONTH,
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
    },
    convertValue: v => v > 300000 ? 300000 : v,
  },
  { // Text Times (Transcript)
    type: 'Timing',
    title: 'Text Times (With Transcript)',
    body: {
      period: ONE_DAY,
      timerange: ONE_MONTH,
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
          label: 'Transcript Done',
          namespace: 'Twilio Health',
          metricName: 'PageToTranscript',
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
    },
    convertValue: v => v > 300000 ? 300000 : v,
  },

  /** Lambda Metrics **/
  { // Infra Errors
    type: 'Metric',
    title: 'Infrastructure Errors',
    body: {
      period: ONE_HOUR * 6,
      timerange: ONE_MONTH,
      metrics: [ {
        type: 'lambda',
        fn: 'all_I',
        metric: 'Errors',
        stat: 'Sum',
      }, ],
    },
    unit: 'Count',
  },
  { // API Errors
    type: 'Metric',
    title: 'API Errors',
    body: {
      period: ONE_HOUR * 6,
      timerange: ONE_MONTH,
      metrics: [
        {
          type: 'count',
          label: 'API 5XX Errors',
          namespace: 'AWS/ApiGateway',
          metricName: '5XXError',
          ApiName: 'CVFD API Gateway',
        },
        {
          type: 'count',
          label: 'API 4XX Errors',
          namespace: 'AWS/ApiGateway',
          metricName: '4XXError',
          ApiName: 'CVFD API Gateway',
        },
        {
          type: 'lambda',
          fn: 'all_A',
          metric: 'Errors',
          stat: 'Sum',
        },
      ],
    },
    unit: 'Count',
  },
  { // Infra Calls
    type: 'Metric',
    title: 'Infrastructure Calls',
    body: {
      period: ONE_HOUR * 6,
      timerange: ONE_MONTH,
      metrics: [ {
        type: 'lambda',
        fn: 'all_I',
        metric: 'Invocations',
        stat: 'Sum',
      }, ],
    },
    unit: 'Count',
  },
  { // API Calls
    type: 'Metric',
    title: 'API Calls',
    lazyLoad: true,
    body: {
      period: ONE_HOUR * 6,
      timerange: ONE_MONTH,
      metrics: [ {
        type: 'lambda',
        fn: 'all_A',
        metric: 'Invocations',
        stat: 'Sum',
      }, ],
    },
    unit: 'Count',
  },
  { // Infra Duration Avg
    type: 'Metric',
    title: 'Infrastructure Durations (average)',
    lazyLoad: true,
    body: {
      period: ONE_HOUR * 6,
      timerange: ONE_MONTH,
      metrics: [ {
        type: 'lambda',
        fn: 'all_I',
        metric: 'Duration',
        stat: 'p50',
      }, ],
    },
    unit: 'Milliseconds',
  },
  { // API Duration Avg
    type: 'Metric',
    lazyLoad: true,
    title: 'API Durations (average)',
    body: {
      period: ONE_HOUR * 6,
      timerange: ONE_MONTH,
      metrics: [ {
        type: 'lambda',
        fn: 'all_A',
        metric: 'Duration',
        stat: 'p50',
      }, ],
    },
    unit: 'Milliseconds',
  },
  { // Infra Duration Max
    type: 'Metric',
    title: 'Infrastructure Durations (max)',
    lazyLoad: true,
    body: {
      period: ONE_HOUR * 6,
      timerange: ONE_MONTH,
      metrics: [ {
        type: 'lambda',
        fn: 'all_I',
        metric: 'Duration',
        stat: 'Maximum',
      }, ],
    },
    unit: 'Milliseconds',
  },
  { // API Duration Max
    type: 'Metric',
    lazyLoad: true,
    title: 'API Durations (max)',
    body: {
      period: ONE_HOUR * 6,
      timerange: ONE_MONTH,
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

  const [
    mode,
    setMode,
  ] = useState<'month' | 'week' | 'day'>('week');
  useEffect(() => {
    setChartLoadedCount(0);
    logger.log('Mode:', mode);
  }, [ mode, ]);

  return <>
    <AdjacentSites />

    <Col className='text-center'>
      {
        ([
          'day',
          'week',
          'month',
        ] as const).map((val, idx) => <React.Fragment key={idx}>
          <input
            type='radio'
            className='btn-check'
            name='range-option'
            id={`${val}Range`}
            autoComplete='off'
            checked={mode === val}
            onChange={e => e.target.checked && setMode(val)}
          />
          <label className='btn' htmlFor={`${val}Range`}>{val[0].toUpperCase()}{val.slice(1)}</label>
        </React.Fragment>)
      }
    </Col>

    {lineChartsToShow.map((chart, idx) => {
      if (!chart.lazyLoad) {
        notLazyCount++;
      }

      const config = {
        shouldFetchData: notLazyCount <= chartLoadedCount + maxParallelCharts,
        setChartLoaded: setChartLoadedCount,
        ...chart,
        body: {
          ...chart.body,
        },
        mode,
      };
      if (mode === 'week') {
        config.body.timerange = ONE_WEEK;
        config.body.period = chart.type === 'Tower'
          ? ONE_HOUR / 2
          : ONE_HOUR;
      }
      if (mode === 'day') {
        config.body.timerange = ONE_DAY;
        config.body.period = chart.type === 'Tower'
          ? ONE_MINUTE * 5
          : ONE_MINUTE * 15;
      }
      return <React.Fragment key={idx}>
        {idx > 0 && <hr />}
        {config.type === 'Tower' && <StatusTowerLineChart {...config} />}
        {config.type === 'Metric' && <StatusMetricLineChart {...config} />}
        {config.type === 'Timing' && <StatusTimingLineChart {...config} />}
      </React.Fragment>;
    })}
  </>;
}
