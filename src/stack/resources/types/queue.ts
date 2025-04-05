import { CreateTextApi } from "@/common/apiv2/twilio";
import { PagingTalkgroup, UserDepartment } from "../../../common/userConstants";
import { FullUserObject } from "@/common/apiv2/users";

export interface ActivateBody {
	action: 'activate';
	phone: string;
	department: UserDepartment;
}

export interface TwilioBody {
	action: 'twilio';
	body: string;
}

export interface TwilioTextQueueItem {
	action: 'twilio-text';
	body: CreateTextApi['body'];
	user: FullUserObject;
};

export interface TwilioErrorBody {
	action: 'twilio_error';
	count: number;
	name: string;
	number: string;
	department: UserDepartment[];
}

export interface AnnounceBody {
	action: 'announce';
	body: string;
	phone: string;
	isTest: boolean;
	department?: UserDepartment;
	talkgroup?: PagingTalkgroup;
}

export interface PageBody {
	action: 'page';
	key: string;
	tg: PagingTalkgroup;
	len?: number;
	isTest?: boolean;
}

export interface LoginBody {
	action: 'login';
	phone: string;
}

export interface TranscribeBody {
	action: 'transcribe';
	'detail-type': string;
	detail: {
		TranscriptionJobName: string;
		TranscriptionJobStatus: string;
	}
}
