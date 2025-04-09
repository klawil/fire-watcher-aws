import { Dispatch, SetStateAction } from "react";
import { GetMetricsApi } from "../api/metrics";

type PossibleChartUnits = 'Count' | 'Milliseconds' | 'Seconds';

interface BaseChart {
  title: string;
  dataUrl?: string;
  body?: GetMetricsApi['body'];
  lazyLoad?: boolean;
}

export interface TowerChart extends BaseChart {
  type: 'Tower';
}

export interface MetricChart extends BaseChart {
  type: 'Metric';
  unit: PossibleChartUnits;
}

export interface TimingChart extends BaseChart {
  type: 'Timing';
  convertValue: (a: number) => number;
}

export type ChartConfig = TowerChart | MetricChart | TimingChart;

export type ChartComponentParams<T extends ChartConfig> = T & {
  shouldFetchData: boolean;
  setChartLoaded: Dispatch<SetStateAction<number>>;
}
