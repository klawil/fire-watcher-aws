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
  ChartComponentParams, TimingChart
} from '@/types/frontend/chart';

export default function StatusTimingLineChart({
  title,
  body,
  shouldFetchData,
  lazyLoad,
  setChartLoaded,
  convertValue = v => v,
}: Readonly<ChartComponentParams<TimingChart>>) {
  const [
    shouldLoad,
    setShouldLoad,
  ] = useState(false);

  if (!lazyLoad && shouldFetchData && !shouldLoad) {
    setShouldLoad(true);
  }

  const data = useChartData(
    body,
    shouldFetchData,
    setChartLoaded,
    false,
    convertValue
  );

  const datasets = data?.datasets.map((v, i, a) => {
    if (i < a.length - 1) return v;

    return {
      ...v,
      data: v.data.map((v, i2) => v - a[i - 1].data[i2]),
    };
  }) || [];

  const [
    pageWidth,
    pageHeight,
  ] = usePageSize();

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
          datasets,
        }}
        options={{
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
          },
          scales: {
            y: {
              min: 0,
              stacked: true,
              title: {
                display: true,
                text: 'Cumulative Time (s)',
              },
              ticks: {
                callback: v => (Number(v) / 1000).toFixed(1),
              },
            },
          },
          plugins: {
            legend: {
              position: pageWidth && pageHeight && pageWidth > pageHeight ? 'right' : 'bottom',
            },
            tooltip: {
              callbacks: {
                label: context => {
                  let label = context.dataset.label || '';

                  if (label) {
                    label += ': ';
                  }
                  if (context.parsed.y !== null) {
                    label += (Math.round(context.parsed.y / 100) / 10).toFixed(1) + 's';
                  }
                  if (context.parsed._stacks?.y && context.datasetIndex > 0) {
                    let sum = 0;
                    for (let i = 0; i <= context.datasetIndex; i++) {
                      sum += context.parsed._stacks.y[i] || 0;
                    }
                    sum = Math.round(sum / 100) / 10;
                    label += ` (cum: ${sum.toFixed(1)}s)`;
                  }
                  return label;
                },
              },
            },
          },
        }}
      />}
    </Col></Row>
  </>;
}
