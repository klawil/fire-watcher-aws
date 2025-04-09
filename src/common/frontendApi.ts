import { PagingTalkgroup, UserDepartment } from "@/types/api/users";
import { ApiResponseBase } from "./common";

/**
 * @deprecated The method should not be used
 */
export type MessageType = 'page' | 'transcript' | 'department' | 'departmentAnnounce' | 'pageAnnounce' | 'account' | 'alert' | 'departmentAlert';

/**
 * @deprecated The method should not be used
 */
export interface TextObject {
	datetime: number;

	type: MessageType;
	isPage: boolean;
	isTest: boolean;

	recipients: number;
	department?: UserDepartment;

	pageId?: string;
	talkgroup?: number;
	pageTime?: number;

	body: string;
	mediaUrls?: string;
	fromNumber?: string;

	sent?: number[];
	sentPhone?: string[];
	delivered?: number[];
	deliveredPhone?: string[];
	undelivered?: number[];
	undeliveredPhone?: string[];
	csLooked?: number[];
	csLookedTime?: number[];
}
interface SeenByRecorder {
	[key: string]: boolean;
}
/**
 * @deprecated The method should not be used
 */
export type SeenByRecorderKeys = 'SupportData' | 'SupportReg' | 'SupportVoice' | 'SiteFailed'
	| 'ValidInfo' | 'CompositeCtrl' | 'NoServReq' | 'BackupCtrl' | 'SupportAuth' | 'ActiveConn'
	| 'ConvChannel';
type BaseSiteObject = {
	[key in SeenByRecorderKeys]?: SeenByRecorder;
}
/**
 * @deprecated The method should not be used
 */
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

/**
 * @deprecated The method should not be used
 */
export interface AnnouncementApiBody {
	body: string;
	test?: boolean;
	department?: UserDepartment;
	talkgroup?: PagingTalkgroup;
}

/**
 * @deprecated The method should not be used
 */
export interface ApiFrontendListTextsResponse extends ApiResponseBase {
	count?: number;
	scanned?: number;
	data?: TextObject[];
}

export interface ApiFrontendStatsResponseSuccess {
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
/**
 * @deprecated The method should not be used
 */
export type ApiFrontendStatsResponse = ApiFrontendStatsResponseSuccess | {
	success: false;
	errors: string[];
	message: string;
};
/**
 * @deprecated The method should not be used
 */
export interface ApiFrontendSitesResponse extends ApiResponseBase {
	data: SiteObject[];
}
