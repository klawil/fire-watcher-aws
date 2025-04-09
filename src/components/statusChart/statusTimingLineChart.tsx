'use client';

import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import LoadingSpinner from "@/components/loadingSpinner/loadingSpinner";
import { useChartData, usePageSize } from "./common";
import { Line } from 'react-chartjs-2';
import { ChartComponentParams, TimingChart } from "@/types/frontend/chart";
import Button from "react-bootstrap/Button";
import { useState } from "react";

export default function StatusTimingLineChart({
  title,
  dataUrl,
  body,
  shouldFetchData,
  lazyLoad,
  setChartLoaded,
  convertValue = (v) => v,
}: Readonly<ChartComponentParams<TimingChart>>) {
  const [shouldLoad, setShouldLoad] = useState(false);

  if (!lazyLoad && shouldFetchData && !shouldLoad) {
    setShouldLoad(true);
  }

  const data = useChartData(
    dataUrl,
    body,
    shouldFetchData,
    setChartLoaded,
    convertValue,
  );

  const [ pageWidth, pageHeight ] = usePageSize();

  return (<>
    <h3 className="text-center mt-5">{title}</h3>
    <Row><Col style={{ height: 'calc(80vh - 60px)' }}>
      {typeof data === 'undefined' && !lazyLoad && <div style={{ height: '100%' }}><LoadingSpinner fullHeight={true} /></div>}
      {typeof data === 'undefined' && lazyLoad && shouldLoad && <LoadingSpinner fullHeight={true} />}
      {typeof data === 'undefined' && lazyLoad && !shouldLoad && <Col
        className="d-grid"
        xs={{ span: 6, offset: 3 }}
        style={{ height: '100%' }}
      >
        <Button
          className="align-self-center"
          variant="success"
          onClick={() => setShouldLoad(true)}
        >Load Chart</Button>
      </Col>}
      {data === null && <h2 className="text-center">Error loading data</h2>}
      {data && <Line
        data={{
          labels: data.labels,
          datasets: data.datasets,
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
            },
          },
          plugins: {
            legend: {
              position: pageWidth && pageHeight && pageWidth > pageHeight ? 'right' : 'bottom',
            },
            tooltip: {
              callbacks: {
                label: context => {
                  console.log(context);
                  let label = context.dataset.label || '';

                  if (label) {
                    label += ': ';
                  }
                  if (context.parsed.y !== null) {
                    label += context.parsed.y + 's';
                  }
                  if (context.parsed._stacks?.y && context.datasetIndex > 0) {
                    let sum = 0;
                    for (let i = 0; i <= context.datasetIndex; i++) {
                      sum += context.parsed._stacks.y[i] || 0;
                    }
                    label += ` (cum: ${sum}s)`;
                  }
                  return label;
                },
              },
            },
          },
        }}
      />}
    </Col></Row>
  </>);
}
