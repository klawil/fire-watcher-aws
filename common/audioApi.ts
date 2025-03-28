import { ApiResponseBase } from "./common";

export interface AudioFileObject {
	Talkgroup: number;
	Key: string;
	Len: number;
	StartTime: number;
	Tone: boolean;
	Emergency?: 0 | 1;
	Tower?: string;
	Transcript?: string;
}
export interface TalkgroupObject {
	ID: number;
	Name?: string;
	InUse?: 'Y' | 'N';
}

export interface ApiAudioListResponse extends ApiResponseBase {
	before: number | null;
	after: number | null;
	afterAdded: number | null;
	files: AudioFileObject[];
}
export interface ApiAudioTalkgroupsResponse extends ApiResponseBase {
	talkgroups?: TalkgroupObject[];
}
