import { CreateTextApi } from "@/types/api/twilio";
import { FullUserObject, PagingTalkgroup, UserDepartment } from "@/types/api/users";
import { DynamicSiteKeys, FullSiteObject } from "@/types/api/sites";

export interface ActivateUserQueueItem {
  action: 'activate-user';
  phone: number;
  department: UserDepartment;
}

export interface TwilioTextQueueItem {
  action: 'twilio-text';
  body: CreateTextApi['body'];
  user: FullUserObject;
}

export interface PhoneNumberIssueQueueItem {
  action: 'phone-issue';
  count: number;
  name: string;
  number: number;
  department: UserDepartment[];
}

export interface SendAnnouncementQueueItem {
  action: 'announce';
  body: string;
  phone: number;
  isTest: boolean;
  department?: UserDepartment;
  talkgroup?: PagingTalkgroup;
}

export interface SendPageQueueItem {
  action: 'page';
  key: string;
  tg: PagingTalkgroup;
  isTest: boolean;
  len?: number; // The number of seconds in the page audio file
}

export interface SendUserAuthCodeQueueItem {
  action: 'auth-code';
  phone: number;
}

export interface TranscribeJobResultQueueItem {
  action: 'transcribe';
  'detail-type': string;
  detail: {
		TranscriptionJobName: string;
		TranscriptionJobStatus: string;
  };
}

export interface SiteStatusQueueItem {
  action: 'site-status';
  sites: {
    [key: string]: Required<Pick<FullSiteObject, DynamicSiteKeys>>;
  }
}
