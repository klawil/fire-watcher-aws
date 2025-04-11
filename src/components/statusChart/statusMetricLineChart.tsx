'use client';

import { useState } from 'react';
import Button from 'react-bootstrap/Button';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';
import { Line } from 'react-chartjs-2';

import {
  useChartData, usePageSize
} from './common';

import LoadingSpinner from '@/components/loadingSpinner/loadingSpinner';
import {
  ChartComponentParams, MetricChart
} from '@/types/frontend/chart';

const msToSFormat = (places: number = 1) => (v: string | number) => {
  if (typeof v === 'string') {
    v = Number(v);
  }

  return (Math.round(v) / 1000).toFixed(places);
};
const secondFormat = (places: number = 1) => (v: string | number) => {
  if (typeof v === 'string') v = Number(v);

  return (Math.round(v * 1000) / 1000).toFixed(places);
};

export default function StatusMetricLineChart({
  title,
  dataUrl,
  body,
  shouldFetchData,
  lazyLoad,
  setChartLoaded,
  unit,
}: Readonly<ChartComponentParams<MetricChart>>) {
  const [
    shouldLoad,
    setShouldLoad,
  ] = useState(false);

  if (!lazyLoad && shouldFetchData && !shouldLoad) {
    setShouldLoad(true);
  }

  const data = useChartData(
    dataUrl,
    body,
    shouldLoad,
    setChartLoaded,
    false
  );

  const [
    pageWidth,
    pageHeight,
  ] = usePageSize();
  const options: Parameters<typeof Line>[0]['options'] = {
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
    },
    scales: {
      y: {
        min: 0,
      },
    },
    plugins: {
      legend: {
        position: pageWidth && pageHeight && pageWidth > pageHeight ? 'right' : 'bottom',
      },
    },
  };
  switch (unit) {
    case 'Milliseconds':
      // Set the scale value to S
      options.scales = options.scales || {};
      options.scales.y = {
        ...options.scales.y,
        title: {
          text: 'Duration (s)',
          display: true,
        },
        ticks: {
          callback: msToSFormat(),
        },
      };

      // Set the tooltip to S
      options.plugins = options.plugins || {};
      options.plugins.tooltip = options.plugins.tooltip || {};
      options.plugins.tooltip.callbacks = {
        ...options.plugins.tooltip.callbacks,
        label: function (context) {
          let label = context.dataset.label || '';

          if (label) {
            label += ': ';
          }
          if (context.parsed.y !== null) {
            label += msToSFormat(3)(context.parsed.y) + 's';
          }
          return label;
        },
      };
      break;
    case 'Seconds':
      // Set the scale value to S
      options.scales = options.scales || {};
      options.scales.y = {
        ...options.scales.y,
        title: {
          text: 'Duration (s)',
          display: true,
        },
        ticks: {
          callback: secondFormat(0),
        },
      };

      // Set the tooltip to S
      options.plugins = options.plugins || {};
      options.plugins.tooltip = options.plugins.tooltip || {};
      options.plugins.tooltip.callbacks = {
        ...options.plugins.tooltip.callbacks,
        label: function (context) {
          let label = context.dataset.label || '';

          if (label) {
            label += ': ';
          }
          if (context.parsed.y !== null) {
            label += secondFormat(1)(context.parsed.y) + 's';
          }
          return label;
        },
      };
      break;
  }

  return <>
    <h3 className='text-center mt-5'>{title}</h3>
    <Row><Col style={{ height: 'calc(80vh - 60px)', }}>
      {typeof data === 'undefined' && !lazyLoad && <div style={{ height: '100%', }}><LoadingSpinner fullHeight={true} /></div>}
      {typeof data === 'undefined' && lazyLoad && shouldLoad && <LoadingSpinner fullHeight={true} />}
      {typeof data === 'undefined' && lazyLoad && !shouldLoad && <Col
        className='d-grid'
        xs={{
          span: 6, offset: 3,
        }}
        style={{ height: '100%', }}
      >
        <Button
          className='align-self-center'
          variant='success'
          onClick={() => setShouldLoad(true)}
        >Load Chart</Button>
      </Col>}
      {data === null && <h2 className='text-center'>Error loading data</h2>}
      {data && data.datasets.length === 0 && <Col
        className='d-grid'
        xs={{
          span: 6, offset: 3,
        }}
        style={{ height: '75%', }}
      ><h2 className='text-center align-self-center'>No Data Found</h2></Col>}
      {data && data.datasets.length > 0 && <Line
        data={{
          labels: data.labels,
          datasets: data.datasets,
        }}
        options={options}
      />}
    </Col></Row>
  </>;
}
