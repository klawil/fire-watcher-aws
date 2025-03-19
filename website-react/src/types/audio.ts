import { ApiAudioListResponse, AudioFileObject } from "$/audioApi";

type PlayerState = 'playing' | 'paused' | 'ended';
type FileAddDirection = 'before' | 'after';

export const filterPresetValues = [
  'NSCAD',
  'NSCFPD',
  'SagMac',
  'BGES',
  'BGFD/BGEMS',
  'SCSO',
  'NSCAll',
  'SCAll',
  'SCAllNA5',
  'ACFE',
  'Hosp',
] as const;
export type FilterPresetUrlParams = typeof filterPresetValues[number];

export const filterPresets: {
  [key in FilterPresetUrlParams]: {
    talkgroups: number[];
    label?: string;
    hide?: boolean;
  };
} = {
  NSCAD: {
    talkgroups: [ 8198 ],
  },
  NSCFPD: {
    talkgroups: [ 8332, 8333, 18332 ],
  },
  SagMac: {
    talkgroups: [ 8330 ],
    label: 'Saguache Mac',
  },
  BGES: {
    talkgroups: [ 8090, 8331, 18331 ],
    label: 'Baca Grande Emergency Services',
  },
  'BGFD/BGEMS': {
    talkgroups: [ 8090, 8331, 18331 ],
    hide: true,
  },
  SCSO: {
    talkgroups: [ 8335, 8336 ],
    label: 'Saguache County Sheriff',
  },
  NSCAll: {
    talkgroups: [ 8198, 8330, 8332, 8333, 18332 ],
    label: 'NSCAD and NSCFPD',
  },
  SCAll: {
    talkgroups: [ 8090, 8198, 8330, 8331, 8332, 8333, 8335, 8336, 18331, 18332 ],
    label: 'Saguache County All',
  },
  SCAllNA5: {
    talkgroups: [ 8198, 8330, 8331, 8332, 8333, 8335, 8336, 18331, 18332 ],
    label: 'Saguache County All (No ARCC 5)',
  },
  ACFE: {
    talkgroups: [ 8181 ],
    label: 'Alamosa EMS/Fire',
  },
  Hosp: {
    talkgroups: [ 8150, 8151, 124, 8138 ],
    label: 'Hospitals',
  },
};

export interface AudioState {
  filterModalOpen: boolean;
  queryParsed: boolean;
  filter: {
    f?: string;
    tg?: string;
    emerg?: string;
  };
  api: {
    [key in FileAddDirection]?: number;
  } & {
    [key in `${FileAddDirection}LastCall`]?: number;
  } & {
    afterAdded?: number;
    loadAfterAdded?: boolean;
  };

  apiResponse: (ApiAudioListResponse & {
    callId: number;
    direction: FileAddDirection;
  })[];
  files: AudioFileObject[];
  talkgroups: {
    [key: string]: {
      name: string;
      selectName: string;
    };
  };

  player: {
    state: PlayerState;
    duration?: number;
    timestamp?: number;
    fileUrl?: string;
  };
};

interface QueryParamsParsedAction {
  action: 'QueryParamsParsed';
  tg?: string;
  emerg?: string;
  f?: string;
}
interface SetFilterValueAction {
  action: 'SetFilterValue';
  tg?: string;
  emerg?: string;
  f?: string;
}
interface FilterModalDisplayAction {
  action: 'CloseFilterModal' | 'OpenFilterModal';
}
interface SetNewFiltersAction {
  action: 'SetNewFilters';
  tg?: string;
  emerg?: string;
  f?: string;
}
type FilterActions = SetFilterValueAction | QueryParamsParsedAction | FilterModalDisplayAction
  | SetNewFiltersAction;

type SetApiKeyAction = {
  action: 'SetApiKeys';
  afterAdded?: number;
} & {
  [key in FileAddDirection]?: number;
};
interface SetApiLastCallAction {
  action: 'SetApiLastCall';
  key: FileAddDirection;
  value?: number;
}
type AddApiResponseAction = AudioState['apiResponse'][number] & {
  action: 'AddApiResponse';
}
interface ClearApiResponseAction {
  action: 'ClearApiResponse';
  direction?: FileAddDirection;
}
interface ApiLoadAfterAddedAction {
  action: 'ApiLoadAfterAdded';
}
type ApiActions = SetApiKeyAction | SetApiLastCallAction | AddApiResponseAction
  | ClearApiResponseAction | ApiLoadAfterAddedAction;

interface AddAudioFileAction {
  action: 'AddAudioFile';
  files: AudioFileObject[];
  location: FileAddDirection;
}
type AudioFileActions = AddAudioFileAction;

interface AddTalkgroupsAction {
  action: 'AddTalkgroups';
  talkgroups: AudioState['talkgroups'];
}

interface SetPlayerStateAction {
  action: 'SetPlayerState';
  state: PlayerState;
}
interface SetPlayerFileAction {
  action: 'SetPlayerFile';
  file?: string;
}
interface SetPlayerTimesAction {
  action: 'SetPlayerTimes';
  duration: number;
  timestamp: number;
}
interface ClearPlayer {
  action: 'ClearPlayer';
}
type PlayerActions = SetPlayerStateAction | SetPlayerFileAction | SetPlayerTimesAction | ClearPlayer;

export type AudioAction = AudioFileActions | AddTalkgroupsAction | PlayerActions | FilterActions
  | ApiActions;
