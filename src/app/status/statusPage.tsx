'use client';

import AdjacentSites from "@/components/adjacentSites/adjacentSites";
import StatusMetricLineChart from "@/components/statusChart/statusMetricLineChart";
import StatusTimingLineChart from "@/components/statusChart/statusTimingLineChart";
import StatusTowerLineChart from "@/components/statusChart/statusTowerLineChart";
import React, { useState } from "react";
import annotationPlugin from 'chartjs-plugin-annotation';
import {
  Chart as ChartJS,
  registerables,
} from 'chart.js';
import { ChartConfig } from "@/types/frontend/chart";

ChartJS.register(
  annotationPlugin,
  ...registerables,
);

const maxParallelCharts = 5;
const lineChartsToShow: ChartConfig[] = [
  {
    type: 'Tower',
    title: 'Saguache Tower Decode Rate',
    dataUrl: 'metrics=tower-sag-max,tower-sag-min,tower-sag-upload&period=300&timerange=86400000&live=y',
  },
  {
    type: 'Tower',
    title: 'Pool Table Decode Rate',
		dataUrl: 'metrics=tower-pt-max,tower-pt-min,tower-pt-upload&period=300&timerange=86400000&live=y',
  },
  // {
  //   type: 'Tower',
  //   title: 'Alamosa Tower Decode Rate',
	// 	dataUrl: 'metrics=tower-ala-max,tower-ala-min,tower-ala-upload&period=300&timerange=86400000&live=y',
  // },
  {
    type: 'Tower',
    title: 'San Antonio Peak Decode Rate',
		dataUrl: 'metrics=tower-sa-max,tower-sa-min,tower-sa-upload&period=300&timerange=86400000&live=y',
  },
  {
    type: 'Metric',
    title: 'VHF Recorder Pings',
		dataUrl: 'metrics=status-120-home,status-cvfd-station&period=300&timerange=86400000',
    unit: 'Count',
  },
  {
    type: 'Metric',
    title: 'Texts Sent',
		dataUrl: 'metrics=twilio-init,twilio-sent,twilio-delivered&period=86400&timerange=2419200000&live=y',
    unit: 'Count',
  },
  {
    type: 'Timing',
    title: 'Text Times',
		dataUrl: 'metrics=twilio-page-duration,twilio-page-time,twilio-sent-time,twilio-delivered-sent-time&period=86400&timerange=2419200000&live=y',
    convertValue: val => val > 300000 ? 300 : Math.ceil(val / 1000),
  },
  {
    type: 'Metric',
    title: 'S3 Uploads',
		dataUrl: 'metrics=tower-sag-upload,tower-ala-upload,tower-pt-upload,tower-sa-upload,tower-mv-upload&live=y',
    unit: 'Count',
  },
  // {
  //   type: 'UploadTime',
  //   title: 'S3 Upload Delay',
	// 	dataUrl: 'metrics=upload-time-cvfd-min,upload-time-cvfd-med,upload-time-cvfd-max,upload-time-nscad-min,upload-time-nscad-med,upload-time-nscad-max',
  // },
  {
    type: 'Metric',
    title: 'Function Calls',
		dataUrl: 'metrics=s3-call,queue-call,alarmqueue-call,status-call,weather-call,infraapi-call,userapi-call,twilioapi-call,eventsapi-call,frontendapi-call,audioapi-call',
    unit: 'Count',
  },
  {
    type: 'Metric',
    title: 'Function Duration',
		dataUrl: 'metrics=s3-dur,queue-dur,alarmqueue-dur,status-dur,weather-dur,infraapi-dur,userapi-dur,twilioapi-dur,eventsapi-dur,frontendapi-dur,audioapi-dur',
    unit: 'Milliseconds',
  },
  {
    type: 'Metric',
    title: 'Function Duration Max',
		dataUrl: 'metrics=s3-dur-max,queue-dur-max,alarmqueue-dur-max,status-dur-max,weather-dur-max,infraapi-dur-max,userapi-dur-max,twilioapi-dur-max,eventsapi-dur-max,frontendapi-dur-max,audioapi-dur-max&live=y',
    unit: 'Milliseconds',
  },
  {
    type: 'Metric',
    title: 'Function Errors',
		dataUrl: 'metrics=s3-err,queue-err,alarmqueue-err,status-err,weather-err,infraapi-err,userapi-err,twilioapi-err,eventsapi-err,frontendapi-err,audioapi-err&live=y',
    unit: 'Count',
  },
];

export default function StatusPage() {
  const [chartLoadedCount, setChartLoadedCount] = useState(0);

  return (<>
    <AdjacentSites />

    {lineChartsToShow.map((chart, idx) => {
      const config = {
        shouldFetchData: idx <= chartLoadedCount + maxParallelCharts,
        setChartLoaded: setChartLoadedCount,
        ...chart,
      };
      return <React.Fragment key={idx}>
        {config.type === 'Tower' && <StatusTowerLineChart {...config} />}
        {config.type === 'Metric' && <StatusMetricLineChart {...config} />}
        {config.type === 'Timing' && <StatusTimingLineChart {...config} />}
      </React.Fragment>
    })}
  </>)
}
