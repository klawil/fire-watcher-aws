'use client';

import {
  Chart as ChartJS,
  registerables
} from 'chart.js';
import annotationPlugin from 'chartjs-plugin-annotation';
import React, {
  useEffect, useReducer, useState
} from 'react';
import Button from 'react-bootstrap/Button';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';

import StatusMetricLineChart from '@/components/statusChart/statusMetricLineChart';
import StatusTimingLineChart from '@/components/statusChart/statusTimingLineChart';
import StatusTowerLineChart from '@/components/statusChart/statusTowerLineChart';
import { ChartConfig } from '@/types/frontend/chart';
import { StatusPagePages } from '@/types/frontend/statusPage';
// import { getLogger } from '@/utils/common/logger';
import {
  defaultStatusPageState,
  statusPageReducer
} from '@/utils/frontend/statusPageState';

// const logger = getLogger('statusPage');

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

function generateSiteCharts(siteId: string): ChartConfig[] {
  return [ {
    id: `${siteId}-server`,
    type: 'Metric',
    title: 'Server Stats',
    unit: 'Percent',
    promBody: {
      metrics: [
        {
          metric: 'disk_usage_percent',
          label: 'Disk',
          conditions: [ {
            label: '@instrumentation.site',
            value: siteId,
          }, ],
          function: {
            name: 'max_over_time',
            windowed: true,
          },
        },
        {
          metric: 'cpu_percent',
          label: 'CPU',
          conditions: [ {
            label: '@instrumentation.site',
            value: siteId,
          }, ],
          function: {
            name: 'max_over_time',
            windowed: true,
          },
        },
        {
          metric: 'virtual_memory_percent',
          label: 'RAM',
          conditions: [ {
            label: '@instrumentation.site',
            value: siteId,
          }, ],
          function: {
            name: 'max_over_time',
            windowed: true,
          },
        },
      ],
    },
  }, ];
}

const maxParallelCharts = 5;
const validIds = [
  'all-recorders',
  'twilio',
  'aws',
  'cvfd-dtr',
  'nscad-dtr',
  'klawil-home-nuc',
] as const;
const idToConfig: {
  [key in StatusPagePages]: {
    label: string;
    charts: ChartConfig[];
  };
} = {
  'all-recorders': {
    label: 'All Recorder Stats',
    charts: [
      { // Upload Count
        id: 'all-dtr-upload',
        type: 'Metric',
        title: 'Files Uploaded',
        unit: 'Count',
        body: {
          metrics: [
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
          ],
        },
      },
      { // Upload Delay
        id: 'all-dtr-upload-delay',
        type: 'Metric',
        unit: 'Seconds',
        title: 'Upload Delay',
        body: {
          metrics: [
            {
              type: 'timing',
              label: 'Pool Table',
              namespace: 'DTR Metrics',
              metricName: 'UploadTime',
              tower: 'PoolTable',
              stat: 'p80',
            },
            {
              type: 'timing',
              label: 'San Antonio Peak',
              namespace: 'DTR Metrics',
              metricName: 'UploadTime',
              tower: 'SanAntonio',
              stat: 'p80',
            },
            {
              type: 'timing',
              label: 'Saguache Tower Uploads',
              namespace: 'DTR Metrics',
              metricName: 'UploadTime',
              tower: 'Saguache',
              stat: 'p80',
            },
          ],
        },
      },
      { // VHF Pings
        id: 'all-recorders-vhf-pings',
        type: 'Metric',
        title: 'VHF Recorder Pings',
        unit: 'Count',
        body: {
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
    ],
  },
  aws: {
    label: 'AWS Infrastructure',
    charts: [
      { // Infra Errors
        id: 'aws-infra-errors',
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
      { // API Errors
        id: 'aws-api-errors',
        type: 'Metric',
        title: 'API Errors',
        body: {
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
        id: 'aws-infra-calls',
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
      { // API Calls
        id: 'aws-api-calls',
        type: 'Metric',
        title: 'API Calls',
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
      { // Infra Duration Avg
        id: 'aws-infra-duration-avg',
        type: 'Metric',
        title: 'Infrastructure Durations (average)',
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
      { // API Duration Avg
        id: 'aws-api-duration-avg',
        type: 'Metric',
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
      { // Infra Duration Max
        id: 'aws-infra-duration-max',
        type: 'Metric',
        title: 'Infrastructure Durations (max)',
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
      { // API Duration Max
        id: 'aws-api-duration-max',
        type: 'Metric',
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
    ],
  },
  'cvfd-dtr': {
    label: 'Crestone Fire Station (DTR)',
    charts: [
      { // Pool Table
        id: 'pool-table-tower-status',
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
        },
      },
      { // San Antonio Peak
        id: 'san-antonio-tower-status',
        type: 'Tower',
        title: 'San Antonio Peak Status',
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
        },
      },
      { // Upload Count
        id: 'cvfd-dtr-upload',
        type: 'Metric',
        title: 'Files Uploaded',
        unit: 'Count',
        body: {
          metrics: [
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
          ],
        },
      },
      { // Upload Delay
        id: 'cvfd-dtr-upload-delay',
        type: 'Metric',
        unit: 'Seconds',
        title: 'Upload Delay',
        body: {
          metrics: [
            {
              type: 'timing',
              label: 'Pool Table',
              namespace: 'DTR Metrics',
              metricName: 'UploadTime',
              tower: 'PoolTable',
              stat: 'Maximum',
            },
            {
              type: 'timing',
              label: 'San Antonio Peak',
              namespace: 'DTR Metrics',
              metricName: 'UploadTime',
              tower: 'SanAntonio',
              stat: 'Maximum',
            },
          ],
        },
      },
      ...generateSiteCharts('cvfd-dtr'),
    ],
  },
  'nscad-dtr': {
    label: 'NSCAD Station (DTR)',
    charts: [
      { // Saguache Tower
        id: 'saguache-tower-status',
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
        },
      },
      { // Upload Count
        id: 'saguache-upload-count',
        type: 'Metric',
        title: 'Files Uploaded',
        unit: 'Count',
        body: {
          metrics: [ {
            type: 'timing',
            label: 'Saguache Tower Uploads',
            namespace: 'DTR Metrics',
            metricName: 'UploadTime',
            tower: 'Saguache',
            stat: 'SampleCount',
          }, ],
        },
      },
      { // Upload Delay
        id: 'saguache-upload-delay',
        type: 'Metric',
        unit: 'Seconds',
        title: 'Upload Delay',
        body: {
          metrics: [ {
            type: 'timing',
            label: 'Saguache Tower',
            namespace: 'DTR Metrics',
            metricName: 'UploadTime',
            tower: 'Saguache',
            stat: 'Maximum',
          }, ],
        },
      },
      ...generateSiteCharts('nscad-dtr'),
    ],
  },
  'klawil-home-nuc': {
    label: 'William Home Station (VHF/UHF)',
    charts: [ ...generateSiteCharts('klawil-home-nuc'), ],
  },
  'twilio': {
    label: 'Twilio Services',
    charts: [
      { // Text Counts
        id: 'twilio-text-count',
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
        id: 'twilio-text-times-non-transcript',
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
        },
        convertValue: v => v > 300000 ? 300000 : v,
      },
      { // Text Times (Transcript)
        id: 'twilio-text-times-transcript',
        type: 'Timing',
        title: 'Text Times (With Transcript)',
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
    ],
  },
};

export default function StatusPage() {
  const [
    state,
    dispatch,
  ] = useReducer(statusPageReducer, defaultStatusPageState);

  const [
    pageInitialized,
    setPageInitialized,
  ] = useState(false);

  // Read the page from the query string on first load
  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('currentPage');
    const found = validIds.find(id => id === param);
    if (found) {
      dispatch({
        action: 'SetCurrentPage',
        currentPage: found,
        allCharts: idToConfig[found].charts.map(v => v.id),
        startLoading: false,
      });
    }
    setPageInitialized(true);
  }, []);

  // Keep the query string in sync with the current page (also sets it if missing)
  useEffect(() => {
    if (!pageInitialized) {
      return;
    }
    const url = new URL(window.location.href);
    if (url.searchParams.get('currentPage') === state.currentPage) {
      return;
    }
    url.searchParams.set('currentPage', state.currentPage);
    window.history.replaceState(null, '', url);
  }, [
    state.currentPage,
    pageInitialized,
  ]);

  const chartsToLoad: string[] = state.allCharts
    .filter(v => !state.loadedCharts.includes(v))
    .slice(0, maxParallelCharts);

  return <>
    <Row><h2 className='text-center'>{ idToConfig[state.currentPage].label }</h2></Row>
    <Row><Col className='text-center mt-2'>
      {
        validIds.map((val, idx) => <React.Fragment key={idx}>
          <input
            type='radio'
            className='btn-check'
            name='page-option'
            id={`${val}Page`}
            autoComplete='off'
            checked={state.currentPage === val}
            onChange={e => {
              if (e.target.checked) {
                dispatch({
                  action: 'SetCurrentPage',
                  currentPage: val,
                  allCharts: idToConfig[val].charts.map(v => v.id),
                  startLoading: true,
                });
              }
            }}
          />
          <label className='btn' htmlFor={`${val}Page`}>{ idToConfig[val].label }</label>
        </React.Fragment>)
      }
    </Col></Row>

    <Row><Col className='text-center mt-2'>
      {
        ([
          'hour',
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
            checked={state.mode === val}
            onChange={e => {
              if (e.target.checked) {
                dispatch({
                  action: 'SetCurrentMode',
                  mode: val,
                });
              }
            }}
          />
          <label className='btn' htmlFor={`${val}Range`}>{val[0].toUpperCase()}{val.slice(1)}</label>
        </React.Fragment>)
      }
    </Col></Row>

    {!state.startLoading && <Row><Col className='text-center mt-3'>
      <Button variant='primary' onClick={() => dispatch({
        action: 'SetStartLoading',
        startLoading: true,
      })}>Start Loading</Button>
    </Col></Row>}
    {state.startLoading && idToConfig[state.currentPage].charts.map((chart, idx) => {
      const config = {
        shouldFetchData: chartsToLoad.includes(chart.id),
        dispatch,
        ...chart,
        body: chart.body
          ? {
            ...chart.body,
          }
          : undefined,
        promBody: chart.promBody
          ? {
            ...chart.promBody,
          }
          : undefined,
        mode: state.mode,
      };
      let timerange: number = ONE_MONTH;
      let period: number = chart.type === 'Tower'
        ? ONE_HOUR * 6
        : ONE_DAY;
      if (state.mode === 'week') {
        timerange = ONE_WEEK;
        period = chart.type === 'Tower'
          ? ONE_HOUR / 2
          : ONE_HOUR;
      }
      if (state.mode === 'day') {
        timerange = ONE_DAY;
        period = chart.type === 'Tower'
          ? ONE_MINUTE * 5
          : ONE_MINUTE * 15;
      }
      if (state.mode === 'hour') {
        timerange = ONE_HOUR;
        period = ONE_MINUTE;
      }
      if (config.body) {
        config.body.timerange = timerange;
        config.body.period = period;
      } else if (config.promBody) {
        config.promBody.timerange = timerange;
        config.promBody.period = period;
      }
      return <React.Fragment key={`${config.id}`}>
        {idx > 0 && <hr />}
        {config.type === 'Tower' && <StatusTowerLineChart {...config} />}
        {config.type === 'Metric' && <StatusMetricLineChart {...config} />}
        {config.type === 'Timing' && <StatusTimingLineChart {...config} />}
      </React.Fragment>;
    })
    }
  </>;
}
