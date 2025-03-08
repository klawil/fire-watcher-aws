import * as aws from 'aws-sdk';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { getLogger } from './logger';

const logger = getLogger('u-auth');

const dynamodb = new aws.DynamoDB();

export const authUserCookie = 'cvfd-user';
export const authTokenCookie = 'cvfd-token';

export const allUserCookies = [
	authUserCookie,
	authTokenCookie,
	'cvfd-user-name',
	'cvfd-user-admin',
	'cvfd-user-super',
];

const userTable = process.env.TABLE_USER as string;

interface Cookies {
	[key: string]: string;
}

export function getCookies(event: APIGatewayProxyEvent): Cookies {
	logger.trace('getCookies', ...arguments);
	return (event.headers.Cookie || '')
		.split('; ')
		.reduce((agg: Cookies, val) => {
			let valSplit = val.split('=');
			if (valSplit[0] !== '') {
				if (valSplit.length < 2) {
					valSplit.push('');
				}

				agg[valSplit[0]] = valSplit[1];
			}
			return agg;
		}, {});
}

export async function getLoggedInUser(event: APIGatewayProxyEvent): Promise<null | AWS.DynamoDB.AttributeMap> {
	logger.trace('getLoggedInUser', ...arguments);

	try {
		const cookies = getCookies(event);

		// Check that the auth cookies are present
		if (
			typeof cookies[authUserCookie] === 'undefined' ||
			typeof cookies[authTokenCookie] === 'undefined'
		) {
			logger.warn('getLoggedInUser', 'failed', 'no cookies');
			return null;
		}

		// Validate the cookies
		const user = await dynamodb.getItem({
			TableName: userTable,
			Key: {
				phone: {
					N: cookies[authUserCookie]
				}
			}
		}).promise();
		if (!user.Item) {
			logger.warn('getLoggedInUser', 'failed', 'invalid user');
			return null;
		}

		const matchingTokens = user.Item.loginTokens?.L
			?.filter(t => t.M?.token?.S === cookies[authTokenCookie])
			.map(t => parseInt(t.M?.tokenExpiry?.N || '0', 10));
		
		if (!matchingTokens || matchingTokens.length === 0) {
			logger.warn('getLoggedInUser', 'failed', 'invalid token');
			return null;
		}

		if (Date.now() > matchingTokens[0]) {
			logger.warn('getLoggedInUser', 'failed', 'expired token');
			return null;
		}

		return user.Item;
	} catch (e) {
		logger.error('getLoggedInUser', e);
		return null;
	}
}
