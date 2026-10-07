import { StatusPageAction } from './statusPage';

import {
  GetMetricsApi, GetPromMetricsApi
} from '@/types/api/metrics';

type PossibleChartUnits = 'Count' | 'Milliseconds' | 'Seconds' | 'Percent';

interface BaseChart {
  id: string;
  title: string;
  body?: GetMetricsApi['body'];
  promBody?: GetPromMetricsApi['body'];
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
  mode: string;
  dispatch: React.ActionDispatch<[action: StatusPageAction]>
};
