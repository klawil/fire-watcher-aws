'use client';

import {
  useContext, useState
} from 'react';
import Button from 'react-bootstrap/Button';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';
import { Line } from 'react-chartjs-2';

import { useChartData } from './common';

import LoadingSpinner from '@/components/loadingSpinner/loadingSpinner';
import {
  ChartComponentParams, TowerChart
} from '@/types/frontend/chart';
import { DarkModeContext } from '@/utils/frontend/clientContexts';

interface ColorConfig {
  backgroundColor: string;
  borderColor: string;
}

const color1: ColorConfig = {
  backgroundColor: 'rgba(54, 162, 235, 0.5)',
  borderColor: 'rgba(54, 162, 235, 0.5)',
};
const color2: ColorConfig = {
  backgroundColor: 'rgba(255, 99, 132, 0.5)',
  borderColor: 'rgba(255, 99, 132, 0.5)',
};

export default function StatusTowerLineChart({
  title,
  dataUrl,
  body,
  lazyLoad,
  shouldFetchData,
  setChartLoaded,
}: Readonly<ChartComponentParams<TowerChart>>) {
  const darkMode = useContext(DarkModeContext);
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
    true
  );

  if (data && data.datasets.length === 3) {
    data.datasets.push({
      backgroundColor: 'rgba(0,0,0,0)',
      fill: false,
      pointStyle: false,
      tension: 0.0,
      label: 'none',
      stepped: true,
      data: data.labels.map((label, i) => {
        const dataA = data.datasets[0].data[i];
        const dataB = data.datasets[1].data[i] as number;

        if (dataA < 30 && dataB < 30) return dataA;
        if (dataA > 30 && dataB > 30) return dataB;
        return 30;
      }),
    });
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
      {data && <Line
        data={{
          labels: data.labels,
          datasets: data.datasets
            .map((dataset, idx) => {
              dataset.label = dataset.label || '';

              if (idx === 0) {
                dataset.borderColor = color1.borderColor;
                dataset.backgroundColor = color1.backgroundColor;
                dataset.showLine = false;
                dataset.fill = {
                  target: 3,
                  above: color1.backgroundColor,
                  below: 'rgba(0, 0, 0, 0)',
                };
              } else if (idx === 1) {
                dataset.borderColor = color2.borderColor;
                dataset.backgroundColor = color2.backgroundColor;
                dataset.showLine = false;
                dataset.fill = {
                  target: 3,
                  above: 'rgba(0, 0, 0, 0)',
                  below: color2.backgroundColor,
                };
              } else if (idx === 2) {
                dataset.yAxisID = 'y2';
                if (darkMode === 'dark') {
                  dataset.borderColor = 'gray';
                }
              }

              return dataset;
            }),
        }}
        options={{
          maintainAspectRatio: false,
          interaction: {
            mode: 'index',
          },
          scales: {
            y: {
              min: 0,
              max: 45,
              title: {
                text: 'Messages per Second',
                display: true,
              },
            },
            y2: {
              type: 'linear',
              display: true,
              position: 'right',
              grid: {
                drawOnChartArea: false,
              },
              title: {
                text: 'Recordings Uploaded',
                display: true,
              },
            },
          },
          plugins: {
            annotation: {
              annotations: {
                line1: {
                  type: 'line',
                  label: {
                    content: 'Service Degraded',
                    display: true,
                    color: darkMode === 'dark' ? '#fff' : '#000',
                    backgroundColor: 'transparent',
                    yAdjust: 10,
                  },
                  yMin: 30,
                  yMax: 30,
                  borderColor: color2.borderColor,
                  borderWidth: 2,
                },
                line2: {
                  type: 'line',
                  label: {
                    content: 'Optimal Service',
                    display: true,
                    color: darkMode === 'dark' ? '#fff' : '#000',
                    backgroundColor: 'transparent',
                    yAdjust: -10,
                  },
                  yMin: 40,
                  yMax: 40,
                  borderColor: color1.borderColor,
                  borderWidth: 2,
                },
              },
            },
            legend: {
              display: false,
            },
            tooltip: {
              filter: (a, b, c) => a.dataset.label !== 'none' &&
                c.map(v => v.dataset.label).indexOf(a.dataset.label) === b,
            },
          },
        }}
      />}
    </Col></Row>
  </>;
}
