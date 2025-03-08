import * as aws from 'aws-sdk';

export const authUserCookie = 'cvfd-user';
export const authTokenCookie = 'cvfd-token';

export const allUserCookies = [
	authUserCookie,
	authTokenCookie,
	'cvfd-user-name',
	'cvfd-user-admin',
	'cvfd-user-super',
];

export function isUserActive(user: aws.DynamoDB.AttributeMap): boolean {
	let userKeys = Object.keys(user);
	for (let i = 0; i < userKeys.length; i++) {
		const key = userKeys[i];
		if (user[key].M?.active?.BOOL) {
			return true;
		}
	}

	return false;
}

export function isUserAdmin(user: aws.DynamoDB.AttributeMap): boolean {
	let userKeys = Object.keys(user);
	for (let i = 0; i < userKeys.length; i++) {
		const key = userKeys[i];
		if (
			user[key].M?.active?.BOOL &&
			user[key].M?.admin?.BOOL
		) {
			return true;
		}
	}

	return false;
}
