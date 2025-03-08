import { ApiResponseBase } from "./common";

export interface AudioFileObject {
	ToneIndex: 'y' | 'n';
	Tower: string;
	Sources: number[];
	Emergency: 0 | 1;
	Len: number;
	Tone: boolean;
	Freq: number;
	Added: number;
	Talkgroup: number;
	EndTime: number;
	Key: string;
	StartTime: number;
}
export interface TalkgroupObject {
	ID: number;
	Count: number;
	Name?: string;
}
export interface TextObject {
	sent?: number[];
	sentPhone?: string[];
	delivered?: number[];
	deliveredPhone?: string[];
	undelivered?: number[];
	undeliveredPhone?: string[];

	isPage: 'y' | 'n';
	isTest: boolean;
	isTestString: 'y' | 'n';

	pageId?: string;
	talkgroup: string;
	pageTime?: number;

	csLooked?: number[];
	csLookedTime?: number[];

	recipients: number;
	datetime: number;

	body: string;
	mediaUrls: string;
	fromNumber: string;
}
interface SeenByRecorder {
	[key: string]: boolean;
}
export type SeenByRecorderKeys = 'SupportData' | 'SupportReg' | 'SupportVoice' | 'SiteFailed'
	| 'ValidInfo' | 'CompositeCtrl' | 'NoServReq' | 'BackupCtrl' | 'SupportAuth' | 'ActiveConn'
	| 'ConvChannel';
type BaseSiteObject = {
	[key in SeenByRecorderKeys]?: SeenByRecorder;
}
export interface SiteObject extends BaseSiteObject {
	SiteId: string;
	SiteName: string;
	SiteCounty?: string;
	SiteRng: number;
	SiteLon?: number;
	SiteLat?: number;
	IsActive: 'y' | 'n';
	UpdateTime?: {
		[key: string]: number;
	};
}

export interface ApiFrontendDtrQueryString {
	tg?: string;
	emerg?: string;
	next?: string;
	before?: string;
	after?: string;
	source?: string;
}
export interface ApiFrontendListTextsBody { }
export interface ApiFrontendPageViewBody { }

export interface ApiFrontendDtrResponse extends ApiResponseBase {
	count: number;
	scanned: number;
	continueToken: string;
	before: number | null;
	after: number | null;
	data: AudioFileObject[];
}
export interface ApiFrontendTalkgroupsResponse extends ApiResponseBase {
	count: number;
	scanned: number;
	data: TalkgroupObject[];
}
export interface ApiFrontendListTextsResponse extends ApiResponseBase {
	count?: number;
	scanned?: number;
	data?: TextObject[];
}
export interface ApiFrontendPageViewResponse { }
export interface ApiFrontendStatsResponse extends ApiResponseBase {
	errors: string[];
	startTime?: number;
	endTime?: number;
	period?: number;
	metrics?: string[];
	data?: {
		names: {
			[key: string]: string;
		},
		data: {
			ts: string;
			values: {
				[key: string]: number;
			};
		}[];
	};
	request?: any;
}
export interface ApiFrontendSitesResponse extends ApiResponseBase {
	data: SiteObject[];
}
