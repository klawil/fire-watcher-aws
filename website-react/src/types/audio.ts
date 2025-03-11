import { AudioFileObject } from "$/audioApi";

type PlayerState = 'playing' | 'paused' | 'finished';

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
    tgValue?: string;
    tgRawValue?: string;
    emergValue?: string;
    tab?: 'all' | 'presets' | 'talkgroups';
  };
}

interface AddAudioFileAction {
  action: 'AddAudioFile';
  files: AudioFileObject[];
  location: 'start' | 'end';
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
  filter: 'tg' | 'emerg';
  value?: string;
  rawValue?: string;
}
interface SetFilterTabAction {
  action: 'SetFilterTab';
  tab: AudioState['filters']['tab'];
}
type FilterActions = SetFilterDisplayAction | SetFilterValueAction | SetFilterTabAction;

export type AudioAction = AudioFileActions | AddTalkgroupsAction | PlayerActions | FilterActions;
