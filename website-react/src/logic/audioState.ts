import { AudioAction, AudioState } from "@/types/audio";

export const filterPresets: {
  [key: string]: string[];
} = {
  'NSCAD': [ '8198' ],
  'NSCFPD': [ '8332', '8333', '18332' ],
  'Sag Mac': [ '8330' ],
  'BGFD/BGEMS': [ '8090', '8331', '18331' ],
  'SC Sheriff': [ '8335', '8336' ],
  'NSCAD and NSCFPD': [ '8198', '8330', '8332', '8333', '18332' ],
  'SC All': [ '8090', '8198', '8330', '8331', '8332', '8333', '8335', '8336', '18331', '18332' ],
  'SC All (no ARCC 5)': [ '8198', '8330', '8331', '8332', '8333', '8335', '8336', '18331', '18332' ],
  'ACFE': [ '8181' ],
  'Hospitals': [ '8150', '8151', '124', '8138' ],
};
export const defaultFilterPreset = 'NSCFPD';

export const defaultAudioState: AudioState = {
  files: [],
  talkgroups: {},
  player: { state: 'finished', },
  filters: {
    queryParsed: false,
    showFilterModal: false,
  },
  api: {
    autoLoadAfter: false,
  },
};

export function audioReducer(state: AudioState, action: AudioAction): AudioState {
  switch (action.action) {
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
    case 'ClearAudioFiles': {
      return {
        ...state,
        files: [],
        api: {
          autoLoadAfter: state.api.autoLoadAfter,
        },
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
          file: action.file,
          state: 'playing',
          duration: 0,
          timestamp: 0,
        },
      };
    }
    case 'SetPlayerDuration':
    case 'SetPlayerTimestamp': {
      return {
        ...state,
        player: {
          ...state.player,
          duration: action.duration,
          timestamp: action.timestamp,
        },
      };
    }
    case 'TogglePlayerAutoplay': {
      return {
        ...state,
        player: {
          ...state.player,
          autoPlay: !state.player.autoPlay,
        },
      };
    }

    // Filter
    case 'SetFilterDisplay': {
      return {
        ...state,
        filters: {
          ...state.filters,
          showFilterModal: action.state,
        },
      };
    }
    case 'SetFilterValue': {
      const newRawValue: Partial<AudioState['filters']> = {};
      if (
        action.filter === 'tg' &&
        (
          typeof action.value === 'undefined' ||
          action.value?.startsWith('p') ||
          action.value === ''
        )
      ) {
        if (
          typeof action.value === 'undefined' ||
          action.value === `p${defaultFilterPreset}` ||
          action.value === ''
        ) {
          newRawValue.tgRawValue = filterPresets[defaultFilterPreset].join('|');
          newRawValue.tgValue = '';
        } else {
          newRawValue.tgRawValue = filterPresets[action.value?.slice(1) || defaultFilterPreset]
            .join('|');
        }
      }

      return {
        ...state,
        filters: {
          ...state.filters,
          [`${action.filter}Value`]: action.value,
          ...newRawValue,
        },
      };
    }
    case 'SetFilterTab': {
      return {
        ...state,
        filters: {
          ...state.filters,
          tab: action.tab,
        },
      };
    }
    case 'QueryParamsParsed': {
      return {
        ...state,
        filters: {
          ...state.filters,
          queryParsed: true,
        },
      };
    }

    // API
    case 'SetApiKey': {
      return {
        ...state,
        api: {
          ...state.api,
          [action.key]: action.value,
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
  }

  return {
    ...state
  };
}
