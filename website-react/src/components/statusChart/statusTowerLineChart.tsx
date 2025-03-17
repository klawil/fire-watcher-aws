'use client';

import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import { Dispatch, SetStateAction, useContext } from "react";
import { Chart, registerables } from "chart.js";
import LoadingSpinner from "../loadingSpinner/loadingSpinner";
import annotationPlugin from 'chartjs-plugin-annotation';
import { useChartData } from "./common";
import { Line } from "react-chartjs-2";
import { DarkModeContext } from "@/logic/clientContexts";

Chart.register(...registerables);
Chart.register(annotationPlugin);

interface ColorConfig {
	backgroundColor: string;
	borderColor: string;
}

const color1: ColorConfig = {
	backgroundColor: 'rgba(54, 162, 235, 0.5)',
	borderColor: 'rgb(54, 162, 235)'
};
const color2: ColorConfig = {
	backgroundColor: 'rgba(255, 99, 132, 0.5)',
	borderColor: 'rgb(255, 99, 132)'
};

export default function StatusTowerLineChart({
  title,
  dataUrl,
  shouldFetchData,
  setChartLoaded,
  convertValue = (v) => v,
}: Readonly<{
  title: string;
  dataUrl: string;
  shouldFetchData: boolean;
  setChartLoaded: Dispatch<SetStateAction<number>>;
  convertValue?: (a: number) => number;
}>) {
  const darkMode = useContext(DarkModeContext);

  const data = useChartData(
    dataUrl,
    shouldFetchData,
    setChartLoaded,
    convertValue,
  );

  if (data && data.datasets.length === 3) {
    data.datasets.push({
      backgroundColor: 'rgba(0,0,0,0)',
      fill: false,
      pointStyle: false,
      tension: 0.0,
      label: 'none',
      data: data.labels.map((label, i) => {
        const dataA = data.datasets[0].data[i];
        const dataB = data.datasets[1].data[i] as number;

        if (dataA < 30 && dataB < 30) return dataA;
        if (dataA > 30 && dataB > 30) return dataB;
        return 30;
      })
    })
  }

  return (<>
    <h3 className="text-center mt-5">{title}</h3>
    <Row><Col>
      {typeof data === 'undefined' && <LoadingSpinner />}
      {data === null && <h2 className="text-center">Error loading data</h2>}
      {data && <Line
        data={{
          labels: data.labels,
          datasets: data.datasets
            .map((dataset, idx) => {
              dataset.label = (dataset.label || '').split(' - ').pop();

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
          interaction: {
            mode: 'index',
          },
          scales: {
            y: {
              min: 0,
              max: 45,
            },
            y2: {
              type: 'linear',
              display: true,
              position: 'right',
              grid: {
                drawOnChartArea: false,
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
                  borderColor: 'rgb(255,99,132)',
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
              // position: 'right',
            },
            tooltip: {
              filter: (a, b, c) => a.dataset.label !== 'none' &&
                c.map(v => v.dataset.label).indexOf(a.dataset.label) === b,
            },
          },
        }}
      />}
    </Col></Row>
  </>);
}
