'use client';

import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import { Dispatch, SetStateAction } from "react";
import { Chart, registerables } from "chart.js";
import LoadingSpinner from "../loadingSpinner/loadingSpinner";
import { useChartData } from "./common";
import { Line } from "react-chartjs-2";

Chart.register(...registerables);

export default function StatusTimingLineChart({
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
  const data = useChartData(
    dataUrl,
    shouldFetchData,
    setChartLoaded,
    convertValue,
  );

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
        options={{
          interaction: {
            mode: 'index',
          },
          scales: {
            y: {
              min: 0,
              stacked: true,
            },
          },
          plugins: {
            legend: {
              position: 'right',
            },
          },
        }}
      />}
    </Col></Row>
  </>);
}
