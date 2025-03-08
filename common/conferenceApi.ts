import { ApiResponseBase } from "./common";

export interface ConferenceAttendeeObject {
	CallSid: string;
	ConferenceSid: string;
	CallSign: string;
	FirstName: string;
	LastName: string;
	Phone: number;
	Type: 'Phone' | 'Browser';
	Room: string;
}

export interface ApiConferenceTokenResponse extends ApiResponseBase {
	token?: string;
}
export type ApiConferenceKickUserResponse = ApiResponseBase;
export type ApiConferenceInviteResponse = ApiResponseBase;
export interface ApiConferenceGetResponse extends ApiResponseBase {
	data?: ConferenceAttendeeObject[];
}
export type ApiConferenceEndResponse = ApiResponseBase;
