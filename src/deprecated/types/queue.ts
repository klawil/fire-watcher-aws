import {
  PagingTalkgroup, UserDepartment
} from '@/types/api/users';

/**
 * @deprecated The method should not be used
 */
export interface ActivateBody {
  action: 'activate';
  phone: string;
  department: UserDepartment;
}

/**
 * @deprecated The method should not be used
 */
export interface TwilioBody {
  action: 'twilio';
  body: string;
}

/**
 * @deprecated The method should not be used
 */
export interface AnnounceBody {
  action: 'announce';
  body: string;
  phone: string;
  isTest: boolean;
  department?: UserDepartment;
  talkgroup?: PagingTalkgroup;
}

/**
 * @deprecated The method should not be used
 */
export interface PageBody {
  action: 'page';
  key: string;
  tg: PagingTalkgroup;
  len?: number;
  isTest?: boolean;
}

/**
 * @deprecated The method should not be used
 */
export interface LoginBody {
  action: 'login';
  phone: string;
}

/**
 * @deprecated The method should not be used
 */
export interface TranscribeBody {
  action: 'transcribe';
  'detail-type': string;
  detail: {
    TranscriptionJobName: string;
    TranscriptionJobStatus: string;
  }
}
