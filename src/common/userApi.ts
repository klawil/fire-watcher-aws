import { PagingTalkgroup, UserDepartment } from "@/types/api/users";
import { ApiResponseBase } from "./common";

/**
 * @deprecated The method should not be used
 */
export type UserObjectBooleans = 'isActive' | 'isAdmin' | 'isDistrictAdmin'
	| 'getTranscript' | 'getApiAlerts' | 'getVhfAlerts' | 'getDtrAlerts';
/**
 * @deprecated The method should not be used
 */
export type UserObjectStrings = 'phone' | 'fName' | 'lName';

interface UserObjectBase {
	talkgroups: PagingTalkgroup[];
	isMe?: boolean;
	lastLogin?: number;
	pagingPhone?: UserDepartment | null;
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
/**
 * @deprecated The method should not be used
 */
export interface UserObject extends UserObjectBase, UserObjectBaseBooleans, UserObjectBaseStrings, UserObjectBaseDepartments {}

/**
 * @deprecated The method should not be used
 */
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

/**
 * @deprecated The method should not be used
 */
export interface ApiUserLoginBody {
	phone: string;
}
/**
 * @deprecated The method should not be used
 */
export interface ApiUserAuthBody {
	code: string;
}
/**
 * @deprecated The method should not be used
 */
export interface ApiUserUpdateBody {
	isMe?: boolean;
	phone: string;
	talkgroups?: PagingTalkgroup[];
	fName?: string;
	lName?: string;
	getTranscript?: boolean;
	getApiAlerts?: boolean;
	getVhfAlerts?: boolean;
	getDtrAlerts?: boolean;
	isDistrictAdmin?: boolean;
	department?: UserDepartment;
	callSign?: string;
	pagingPhone?: UserDepartment | null;
}
/**
 * @deprecated The method should not be used
 */
export interface ApiUserUpdateGroupBody {
	phone: string;
	department: UserDepartment;
	active?: boolean;
	callSign?: string;
	admin?: boolean;
}
/**
 * @deprecated The method should not be used
 */
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
/**
 * @deprecated The method should not be used
 */
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

/**
 * @deprecated The method should not be used
 */
export interface ApiUserLoginResult extends ApiResponseBase {
	errors: string[];
	data?: string[];
}
/**
 * @deprecated The method should not be used
 */
export interface ApiUserAuthResponse extends ApiResponseBase {
	errors: string[];
}
/**
 * @deprecated The method should not be used
 */
export interface ApiUserGetUserResponse extends ApiResponseBase, Partial<UserObject> {
	isDistrictAdmin: boolean;
	isUser: boolean;
	fidoKeyIds?: {
		[key: string]: string;
	};
}
/**
 * @deprecated The method should not be used
 */
export interface ApiUserUpdateResponse extends ApiResponseBase {
	errors: string[];
	user?: UserObject;
}
/**
 * @deprecated The method should not be used
 */
export interface ApiUserFidoGetAuthResponse extends ApiResponseBase {
	challenge: string; // Baes64 Buffer
}
/**
 * @deprecated The method should not be used
 */
export type ApiUserFidoAuthResponse = ApiResponseBase;
/**
 * @deprecated The method should not be used
 */
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
/**
 * @deprecated The method should not be used
 */
export type ApiUserFidoRegisterResponse = ApiResponseBase;
/**
 * @deprecated The method should not be used
 */
export interface ApiUserListResponse extends ApiResponseBase {
	users: UserObject[];
}