import { AudioAction, AudioState } from "@/types/audio";

export const defaultFilterPreset = 'NSCFPD';

export const defaultAudioState: AudioState = {
  filterModalOpen: false,
  calendarModalOpen: false,
  queryParsed: false,
  filter: {},
  api: {},
  apiResponse: [],
  talkgroups: {},
  files: [],

  player: { state: 'ended', },
};

export function audioReducer(state: AudioState, action: AudioAction): AudioState {
  switch (action.action) {
    // Filter
    case 'QueryParamsParsed': {
      const { action: _, ...data } = action;
      return {
        ...state,
        queryParsed: true,
        filter: data,
      };
    }
    case 'SetFilterValue': {
      const { action: _, ...data } = action;
      return {
        ...state,
        filter: {
          ...state.filter,
          ...data,
        },
      };
    }
    case 'CloseFilterModal':
    case 'OpenFilterModal': {
      return {
        ...state,
        filterModalOpen: action.action === 'OpenFilterModal',
      };
    }
    case 'SetNewFilters':
    case 'JumpToTime': {
      const { action: _, ...data } = action;
      return {
        ...state,
        files: [],
        api: {},
        filter: {
          ...(_ === 'SetNewFilters' ? {} : state.filter),
          ...data,
        },
        filterModalOpen: false,
        calendarModalOpen: false,
        player: { state: 'ended' },
      };
    }

    // Talkgroups
    case 'AddTalkgroups': {
      return {
        ...state,
        talkgroups: {
          ...state.talkgroups,
          ...action.talkgroups,
        },
      };
    }

    // Files
    case 'AddAudioFile': {
      // Remove duplicate files
      const alreadyContainedIds = state.files.map(f => f.Key);
      const newFiles = action.files.filter(f => !alreadyContainedIds.includes(f.Key));

      return {
        ...state,
        files: [
          ...(action.location === 'after' ? newFiles : []),
          ...state.files,
          ...(action.location === 'before' ? newFiles : []),
        ],
      };
    }

    // API
    case 'SetApiKeys': {
      const { action: _, ...data } = action;
      return {
        ...state,
        api: {
          ...state.api,
          ...data,
        },
      };
    }
    case 'SetApiLastCall': {
      return {
        ...state,
        api: {
          ...state.api,
          [`${action.key}LastCall`]: action.value,
        },
      };
    }
    case 'ApiLoadAfterAdded': {
      return {
        ...state,
        api: {
          ...state.api,
          loadAfterAdded: true,
        },
      };
    }
    case 'AddApiResponse': {
      const { action: _, ...data } = action;
      return {
        ...state,
        apiResponse: [
          ...state.apiResponse,
          { ...data },
        ]
      };
    }
    case 'ClearApiResponse': {
      const [ _, ...rest ] = state.apiResponse;
      return {
        ...state,
        apiResponse: rest,
        api: {
          ...state.api,
          ...(action.direction ? {
            [`${action.direction}LastCall`]: undefined,
          } : {}),
        },
      };
    }

    // Player
    case 'SetPlayerState': {
      return {
        ...state,
        player: {
          ...state.player,
          state: action.state,
        },
      };
    }
    case 'SetPlayerFile': {
      return {
        ...state,
        player: {
          ...state.player,
          fileUrl: action.file,
          state: 'playing',
          duration: 0,
          timestamp: 0,
        },
      };
    }
    case 'SetPlayerTimes': {
      return {
        ...state,
        player: {
          ...state.player,
          duration: action.duration,
          timestamp: action.timestamp,
        },
      };
    }
    case 'ClearPlayer': {
      return {
        ...state,
        player: { state: 'ended' },
      };
    }

    // Calendar Modal
    case 'CloseCalendarModal':
    case 'OpenCalendarModal': {
      return {
        ...state,
        calendarModalOpen: action.action === 'OpenCalendarModal',
      };
    }
  }

  return {
    ...state
  };
}
