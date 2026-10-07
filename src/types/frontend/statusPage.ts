export type StatusPagePages = 'aws' | 'twilio' | 'all-recorders' | 'cvfd-dtr' | 'nscad-dtr' | 'klawil-home-nuc';
export type StatusPageTimeframe = 'month' | 'week' | 'day' | 'hour';

export interface StatusPageState {
  loadedCharts: string[];
  allCharts: string[];
  startLoading: boolean;
  mode: StatusPageTimeframe;
  currentPage: StatusPagePages;
}

interface SetChartLoaded {
  action: 'SetChartLoaded';
  chartId: string;
}
interface SetCurrentPage {
  action: 'SetCurrentPage';
  currentPage: StatusPagePages;
  allCharts: string[];
  startLoading: boolean;
}
interface SetCurrentMode {
  action: 'SetCurrentMode';
  mode: StatusPageTimeframe;
}
interface SetStartLoading {
  action: 'SetStartLoading';
  startLoading: boolean;
}

export type StatusPageAction = SetChartLoaded | SetCurrentPage | SetCurrentMode | SetStartLoading;
