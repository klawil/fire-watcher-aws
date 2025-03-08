import { ApiResponseBase } from "./common";

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
	talkgroups: string[];
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
export interface ApiUserGetUserResponse extends ApiResponseBase {
	isUser: boolean;
	isActive: boolean;
	isAdmin: boolean;
	isDistrictAdmin: boolean;
	phone?: string;
	callSign?: string;
	fName?: string;
	lName?: string;
	department?: string;
	talkgroups?: string[];
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