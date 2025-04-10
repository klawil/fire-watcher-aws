import { ApiResponseBase } from './common';

/**
 * @deprecated The method should not be used
 */
export interface AudioFileObject {
  Talkgroup: number;
  Key: string;
  Len: number;
  StartTime: number;
  Added: number;
  Tone: boolean;
  Emergency?: 0 | 1;
  Tower?: string;
  Transcript?: string;
}

/**
 * @deprecated The method should not be used
 */
export interface TalkgroupObject {
  ID: number;
  Name?: string;
  InUse?: 'Y' | 'N';
  Count?: number;
}

/**
 * @deprecated The method should not be used
 */
export interface ApiAudioListResponse extends ApiResponseBase {
  before: number | null;
  after: number | null;
  afterAdded: number | null;
  files: AudioFileObject[];
}

/**
 * @deprecated The method should not be used
 */
export interface ApiAudioTalkgroupsResponse extends ApiResponseBase {
  talkgroups: TalkgroupObject[];
  count: number;
  loadedAll: boolean;
}
