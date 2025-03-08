import { ApiResponseBase } from "./common";
import { PagingTalkgroup, UserDepartment } from "./userConstants";

export type UserObjectBooleans = 'isActive' | 'isAdmin' | 'isDistrictAdmin'
	| 'pageOnly' | 'getTranscript' | 'getApiAlerts' | 'getVhfAlerts' | 'getDtrAlerts';
export type UserObjectStrings = 'phone' | 'fName' | 'lName' | 'callSignS';

interface UserObjectBase1 {
	talkgroups: PagingTalkgroup[];
	department?: UserDepartment;

	isMe?: boolean;
}
type UserObjectBase2 = {
	[key in UserObjectBooleans]?: boolean;
}
type UserObjectBase3 = {
	[key in UserObjectStrings]: string;
}
export interface UserObject extends UserObjectBase1, UserObjectBase2, UserObjectBase3 {}

export interface ApiUserLoginBody {
	phone: string;
}
export interface ApiUserAuthBody {
	code: string;
}
export interface ApiUserUpdateBody {
	fName: string;
	lName: string;
	isMe: boolean;
	phone: string;
	talkgroups: number[];
}
export interface ApiUserFidoAuthBody {
	rawId: string;
	challenge: string;
	test?: boolean;
	phone?: string;
	response: {
		authenticatorData: string;
		signature: string;
		userHandle: string;
		clientDataJSON: string;
		id: string;
		type: string;
	};
}
export interface ApiUserFidoRegisterBody {
	challenge: string;
	name: string;
	userId: string;
	credential: {
		rawId: string;
		response: {
			attestationObject: string;
			clientDataJSON: string;
		};
	};
}

export interface ApiUserLoginResult extends ApiResponseBase {
	errors: string[];
	data?: string[];
}
export interface ApiUserAuthResponse extends ApiResponseBase {
	errors: string[];
}
export interface ApiUserGetUserResponse extends ApiResponseBase, Partial<UserObject> {
	isDistrictAdmin: boolean;
	isUser: boolean;
	fidoKeys?: {
		[key: string]: string;
	};
}
export interface ApiUserUpdateResponse extends ApiResponseBase {
	errors: string[];
}
export interface ApiUserFidoGetAuthResponse extends ApiResponseBase {
	challenge: string; // Baes64 Buffer
}
export type ApiUserFidoAuthResponse = ApiResponseBase;
export interface ApiUserFidoChallengeResponse extends ApiResponseBase {
	options: {
		challenge: string; // Base64 Buffer
		rp: {
			name: string;
			id: string;
		};
		user: {
			name: string;
			displayName: string;
			id: string; // Base64 Buffer
		};
		pubKeyCredParams: {
			type: 'public-key';
			alg: number;
		}[];
		timeout?: number;
		attestation?: 'direct' | 'indirect' | 'none';
	};
};
export type ApiUserFidoRegisterResponse = ApiResponseBase;
export interface ApiUserListResponse extends ApiResponseBase {
	users: UserObject[];
}