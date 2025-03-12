import { AudioFileObject } from "$/audioApi";

type PlayerState = 'playing' | 'paused' | 'finished';
type FileAddDirection = 'before' | 'after';

export interface AudioState {
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
    file?: string;
    autoPlay?: boolean;
  };
  filters: {
    showFilterModal: boolean;
    queryParsed: boolean;
    fValue?: string;
    tgValue?: string;
    tgRawValue?: string;
    emergValue?: string;
    tab?: 'all' | 'presets' | 'talkgroups';
  };
  api: {
    [key in FileAddDirection]?: number;
  } & {
    [key in `${FileAddDirection}LastCall`]?: number;
  } & {
    autoLoadAfter: boolean;
    afterAdded?: number;
  };
}

interface AddAudioFileAction {
  action: 'AddAudioFile';
  files: AudioFileObject[];
  location: FileAddDirection;
}
interface ClearAudioFilesAction {
  action: 'ClearAudioFiles';
}
type AudioFileActions = AddAudioFileAction | ClearAudioFilesAction;

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
  file: string;
}
interface SetPlayerDurationAction {
  action: 'SetPlayerDuration' | 'SetPlayerTimestamp';
  duration: number;
  timestamp: number;
}
interface TogglePlayerAutoplayAction {
  action: 'TogglePlayerAutoplay';
};
type PlayerActions = SetPlayerStateAction | SetPlayerFileAction | SetPlayerDurationAction
  | TogglePlayerAutoplayAction;

interface SetFilterDisplayAction {
  action: 'SetFilterDisplay';
  state: boolean;
}
interface SetFilterValueAction {
  action: 'SetFilterValue';
  filter: 'tg' | 'emerg' |'f';
  value?: string;
  rawValue?: string;
}
interface SetFilterTabAction {
  action: 'SetFilterTab';
  tab: AudioState['filters']['tab'];
}
interface QueryParamsParsedAction {
  action: 'QueryParamsParsed';
}
type FilterActions = SetFilterDisplayAction | SetFilterValueAction | SetFilterTabAction
  | QueryParamsParsedAction;

interface SetApiKeyAction {
  action: 'SetApiKey';
  key: FileAddDirection | 'afterAdded';
  value: number;
}
interface SetApiLastCallAction {
  action: 'SetApiLastCall';
  key: FileAddDirection;
  value?: number;
}
type ApiActions = SetApiKeyAction | SetApiLastCallAction;

export type AudioAction = AudioFileActions | AddTalkgroupsAction | PlayerActions | FilterActions
  | ApiActions;
