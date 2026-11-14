'use client';

import {
  useCallback, useEffect, useState
} from 'react';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';
import { Line } from 'react-chartjs-2';
import { BsArrowClockwise } from 'react-icons/bs';

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
  if (typeof v === 'string') {
    v = Number(v);
  }

  if (v > 60 * 60) {
    v = Math.round(v);
    const days = Math.floor(v / (60 * 60 * 24));
    const hours = Math.floor((v % (60 * 60 * 24)) / (60 * 60));
    const minutes = Math.floor((v % (60 * 60)) / 60);
    const seconds = v % 60;
    const parts: string[] = [];
    if (hours > 0) {
      parts.push(`${hours}`);
    }
    parts.push(`${minutes.toString().padStart(2, '0')}`);
    parts.push(`${seconds.toString().padStart(2, '0')}`);
    if (days > 0) {
      return `${days}d ${parts.join(':')}`;
    }
    return parts.join(':');
  }

  return (Math.round(v * 1000) / 1000).toFixed(places);
};

export default function StatusMetricLineChart({
  id,
  title,
  body,
  promBody,
  shouldFetchData,
  dispatch,
  unit,
  mode,
  limit,
}: Readonly<ChartComponentParams<MetricChart>>) {
  const [
    shouldLoad,
    setShouldLoad,
  ] = useState(false);

  if (shouldFetchData && !shouldLoad) {
    setShouldLoad(true);
  }

  const [
    data,
    resetDataRaw,
  ] = useChartData(
    id,
    body,
    promBody,
    shouldLoad,
    dispatch,
    false
  );

  const resetData = useCallback(() => {
    resetDataRaw();
    setShouldLoad(true);
  }, [ resetDataRaw, ]);

  useEffect(() => {
    resetDataRaw();
  }, [ mode, ]); // eslint-disable-line react-hooks/exhaustive-deps

  const yMax: {
    max?: number;
  } = {};
  if (limit) {
    console.log(data?.datasets);
    const maxDataValue = data?.datasets?.reduce((m, d) => {
      if (d.data) {
        const localMax = Math.max(...d.data);
        if (localMax > m) {
          m = localMax;
        }
      }
      return m;
    }, 0) || 0;
    if (!isNaN(maxDataValue) && maxDataValue > 30) {
      yMax.max = 30;
    }
  }

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
        ...yMax,
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
    case 'Percent':
      // Set the scale value to S
      options.scales = options.scales || {};
      options.scales.y = {
        ...options.scales.y,
        title: {
          text: 'Percent (%)',
          display: true,
        },
        ticks: {
          callback: v => (Math.round(Number(v) * 10) / 10).toFixed(1) + '%',
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
            label += (Math.round(context.parsed.y * 10) / 10).toFixed(1) + '%';
          }
          return label;
        },
      };
      break;
  }

  return <>
    <h3 className='text-center mt-4'>{title} <BsArrowClockwise
      style={{ cursor: 'pointer', }}
      onClick={resetData}
    /></h3>
    <Row><Col style={{ height: 'calc(80vh - 60px)', }}>
      {typeof data === 'undefined' && <div style={{ height: '100%', }}><LoadingSpinner fullHeight={true} /></div>}
      {data === null && <h2 className='text-center'>Error loading data</h2>}
      {data && data.datasets.length === 0 && <Col
        className='d-grid'
        xs={{
          span: 6,
          offset: 3,
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
