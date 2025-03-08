import { ApiUserFidoAuthBody, ApiUserFidoAuthResponse, ApiUserFidoGetAuthResponse, ApiUserGetUserResponse } from '../../../common/userApi';
import { showAlert } from './alerts';
import { getLogger } from '../../../stack/resources/utils/logger';
import { validDepartments } from '../../../common/userConstants';

const logger = getLogger('auth');

export const base64ToBuffer = (base64: string) => Uint8Array.from(atob(base64), c => c.charCodeAt(0));
export const bufferToBase64 = (buffer: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)));

export async function useFidoKey(keyIds: string[], isTest: boolean): Promise<boolean> {
	logger.trace('useFidoKey', ...arguments);
	let result: ApiUserFidoAuthResponse = {
		success: false,
		message: 'Failed to authenticate',
	};
	try {
		const challengeData: ApiUserFidoGetAuthResponse = await fetch(`/api/user?action=fido-get-auth`).then(r => r.json());
		
		const challengeArr = base64ToBuffer(challengeData.challenge);
		const challenge: CredentialRequestOptions = {
			publicKey: {
				challenge: challengeArr,
				allowCredentials: keyIds.map(id => ({
					id: base64ToBuffer(id),
					type: 'public-key',
					transports: [ 'internal' ],
				})),
			}
		};
		const credential = (await navigator.credentials.get(challenge)) as PublicKeyCredential & {
			response: AuthenticatorAssertionResponse;
		};

		const userAuthBody: ApiUserFidoAuthBody = {
			rawId: bufferToBase64(credential.rawId),
			challenge: bufferToBase64(challengeArr),
			test: isTest,
			response: {
				authenticatorData: bufferToBase64(credential.response.authenticatorData),
				signature: bufferToBase64(credential.response.signature),
				userHandle: bufferToBase64(credential.response.userHandle as ArrayBuffer),
				clientDataJSON: bufferToBase64(credential.response.clientDataJSON),
				id: credential.id,
				type: credential.type,
			},
		};

		result = await fetch(`/api/user?action=fido-auth`, {
			method: 'POST',
			body: JSON.stringify(userAuthBody),
		}).then(r => r.json());
	} catch (e) {
		result.message = (<Error>e).message;
		logger.error('useFidoKey', e);
	}

	const alertMessage = `Token ${isTest ? 'Test' : 'Login'}: ${result.success ? 'Success!' : `Failed - ${result.message}`}`;
	showAlert(result.success ? 'success' : 'danger', alertMessage);
	return result.success;
}

export const afterAuthUpdate: Function[] = [];

const fNameCookie = document.cookie.split('cvfd-user-name=')[1];
export let user: ApiUserGetUserResponse = {
	success: false,
	isActive: document.cookie.indexOf('cvfd-token') !== -1,
	isUser: document.cookie.indexOf('cvfd-token') !== -1,
	isAdmin: document.cookie.indexOf('cvfd-user-admin=1') !== -1,
	isDistrictAdmin: document.cookie.indexOf('cvfd-user-super=1') !== -1,
	fName: typeof fNameCookie !== 'undefined' ? fNameCookie.split(';')[0] : undefined,
};
const cookies: {
	[key: string]: string | null;
} = {};
document.cookie.split('; ').forEach(cookie => {
	let eqSign = cookie.indexOf('=');
	if (eqSign === -1) {
		cookies[cookie] = null;
		return;
	}

	cookies[cookie.slice(0, eqSign)] = cookie.slice(eqSign + 1);
});
validDepartments.forEach(dep => {
	const cookieName = `cvfd-user-${dep}`;
	if (typeof cookies[cookieName] === 'string') {
		try {
			user[dep] = JSON.parse(cookies[cookieName] as string);
		} catch (e) {
			logger.error(`Error parsing cookie ${cookieName}`, e);
		}
	} else {
		user[dep] = {
			active: false,
			callSign: '',
			admin: false,
		};
	}
});
logger.debug('Initial User:', user);

// Show the available links
if (user.isUser) {
	Array.from(document.getElementsByClassName('requireUser'))
		.forEach(elem => elem.classList.remove('d-none'));

	(<HTMLAnchorElement>document.getElementById('loginLink')).classList.add('d-none');
	const username = <HTMLDivElement>document.getElementById('username');
	username.innerHTML = user.fName || 'User';
	username.classList.remove('d-none');
	(<HTMLAnchorElement>document.getElementById('logoutLink')).classList.remove('d-none');
}
if (user.isAdmin) {
	Array.from(document.getElementsByClassName('requireAdmin'))
		.forEach(elem => elem.classList.remove('d-none'));
}
if (user.isDistrictAdmin) {
	Array.from(document.getElementsByClassName('requireDistrictAdmin'))
		.forEach(elem => elem.classList.remove('d-none'));
}

if (document.cookie.indexOf('cvfd-token') !== -1) {
	logger.debug('Fetching updated user data');
	fetch(`/api/user?action=getUser`)
		.then(r => r.json())
		.then(data => {
			logger.debug('User API response:', data);
			user = data;
		})
		.catch(e => logger.error('getUser API', e))
		.finally(() => {
			afterAuthUpdate.forEach(fn => fn());
			afterAuthUpdate.push = fn => fn();
		});
}

export function authInit() {
	logger.trace('authInit');
}
