import { ApiResponseBase } from "./common";
import { PagingTalkgroup, UserDepartment } from "./userConstants";

export type UserObjectBooleans = 'isActive' | 'isAdmin' | 'isDistrictAdmin'
	| 'getTranscript' | 'getApiAlerts' | 'getVhfAlerts' | 'getDtrAlerts';
export type UserObjectStrings = 'phone' | 'fName' | 'lName';

interface UserObjectBase {
	talkgroups: PagingTalkgroup[];
	isMe?: boolean;
	loginTokens?: {
		token: string;
		tokenExpiry: number;
	}[];
	lastLogin?: number;
}
type UserObjectBaseBooleans = {
	[key in UserObjectBooleans]?: boolean;
}
type UserObjectBaseStrings = {
	[key in UserObjectStrings]: string;
}
type UserObjectBaseDepartments = {
	[key in UserDepartment]?: {
		active: boolean;
		callSign: string;
		admin: boolean;
	};
}
export interface UserObject extends UserObjectBase, UserObjectBaseBooleans, UserObjectBaseStrings, UserObjectBaseDepartments {}

export interface InternalUserObject extends UserObject {
	fidoKeys?: {
		[key: string]: {
			prevCount: number;
			pubKey: string;
			rawId: string;
		};
	};
	fidoUserId?: string;
	lastLogin?: number;
	lastStatus?: string;
	lastStatusCount?: number;
	loginTokens?: {
		token: string;
		tokenExpiry: number;
	}[];
}

export interface ApiUserLoginBody {
	phone: string;
}
export interface ApiUserAuthBody {
	code: string;
}
export interface ApiUserUpdateBody {
	isMe?: boolean;
	phone: string;
	talkgroups?: number[];
	fName?: string;
	lName?: string;
	getTranscript?: boolean;
	getApiAlerts?: boolean;
	getVhfAlerts?: boolean;
	getDtrAlerts?: boolean;
	isDistrictAdmin?: boolean;
	department?: UserDepartment;
	callSign?: string;
}
export interface ApiUserUpdateGroupBody {
	phone: string;
	department: UserDepartment;
	active?: boolean;
	callSign?: string;
	admin?: boolean;
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
	fidoKeyIds?: {
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