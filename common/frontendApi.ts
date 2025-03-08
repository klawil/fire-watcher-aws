import { ApiResponseBase } from "./common";

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

export interface ApiFrontendListTextsResponse extends ApiResponseBase {
	count?: number;
	scanned?: number;
	data?: TextObject[];
}

interface ApiFrontendStatsResponseSuccess {
	success: true;
	errors: string[];
	startTime: number;
	endTime: number;
	period: number;
	metrics: string[];
	data: {
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
}
export type ApiFrontendStatsResponse = ApiFrontendStatsResponseSuccess | {
	success: false;
	errors: string[];
	message: string;
};
export interface ApiFrontendSitesResponse extends ApiResponseBase {
	data: SiteObject[];
}
