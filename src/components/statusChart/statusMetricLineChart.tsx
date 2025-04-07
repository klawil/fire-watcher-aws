'use client';

import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import LoadingSpinner from "../loadingSpinner/loadingSpinner";
import { useChartData, usePageWidth } from "./common";
import { Line } from 'react-chartjs-2';
import { ChartComponentParams, MetricChart } from "@/types/frontend/chart";

const msToSFormat = (places: number = 1) => (v: string | number) => {
  if (typeof v === 'string') {
    v = Number(v);
  }

  return (Math.round(v) / 1000).toFixed(places);
}

export default function StatusMetricLineChart({
  title,
  dataUrl,
  shouldFetchData,
  setChartLoaded,
  unit,
}: Readonly<ChartComponentParams<MetricChart>>) {
  const data = useChartData(
    dataUrl,
    shouldFetchData,
    setChartLoaded,
  );

  const pageWidth = usePageWidth();
  const options: Parameters<typeof Line>[0]['options'] = {
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
        position: pageWidth && pageWidth >= 992 ? 'right' : 'bottom',
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
        label: function(context) {
          let label = context.dataset.label || '';

          if (label) {
            label += ': ';
          }
          if (context.parsed.y !== null) {
            label += msToSFormat(3)(context.parsed.y) + 's';
          }
          return label;
        }
      };
      break;
  }

  return (<>
    <h3 className="text-center mt-5">{title}</h3>
    <Row><Col>
      {typeof data === 'undefined' && <LoadingSpinner />}
      {data === null && <h2 className="text-center">Error loading data</h2>}
      {data && <Line
        data={{
          labels: data.labels,
          datasets: data.datasets,
        }}
        options={options}
      />}
    </Col></Row>
  </>);
}
