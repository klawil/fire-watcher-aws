import {
  StatusPageAction, StatusPageState
} from '@/types/frontend/statusPage';

export const defaultStatusPageState: StatusPageState = {
  loadedCharts: [],
  allCharts: [],
  startLoading: false,
  mode: 'week',
  currentPage: 'all-recorders',
};

export function statusPageReducer(
  state: StatusPageState,
  action: StatusPageAction
): StatusPageState {
  switch (action.action) {
    case 'SetChartLoaded':
      if (!state.allCharts.includes(action.chartId)) {
        return {
          ...state,
        };
      }
      return {
        ...state,
        loadedCharts: [
          ...state.loadedCharts.filter(id => id !== action.chartId),
          action.chartId,
        ],
      };
    case 'SetCurrentPage':
      return {
        ...state,
        currentPage: action.currentPage,
        allCharts: [ ...action.allCharts, ],
        loadedCharts: [],
        startLoading: action.startLoading,
      };
    case 'SetCurrentMode':
      return {
        ...state,
        mode: action.mode,
        loadedCharts: [],
      };
    case 'SetStartLoading':
      return {
        ...state,
        startLoading: action.startLoading,
      };
    default:
      return state;
  }
}
