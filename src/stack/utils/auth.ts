import * as aws from 'aws-sdk';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { getLogger } from '../../logic/logger';
import { parseDynamoDbAttributeMap } from './dynamodb';
import { InternalUserObject } from '../../common/userApi';
import { authTokenCookie, authUserCookie, isUserActive, isUserAdmin } from '../resources/types/auth';

const logger = getLogger('u-auth');

const dynamodb = new aws.DynamoDB();

const userTable = process.env.TABLE_USER;

interface Cookies {
	[key: string]: string;
}

/**
 * @deprecated The method should not be used
 */
export function getCookies(event: APIGatewayProxyEvent): Cookies {
	logger.trace('getCookies', event);
	return (event.headers.Cookie || '')
		.split('; ')
		.reduce((agg: Cookies, val) => {
			const valSplit = val.split('=');
			if (valSplit[0] !== '') {
				if (valSplit.length < 2) {
					valSplit.push('');
				}

				agg[valSplit[0]] = valSplit[1];
			}
			return agg;
		}, {});
}

/**
 * @deprecated The method should not be used
 */
export async function getLoggedInUser(event: APIGatewayProxyEvent): Promise<null | InternalUserObject> {
	logger.trace('getLoggedInUser', event);

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

		// Handle the isAdmin determination
		const parsedUser = parseDynamoDbAttributeMap(user.Item) as unknown as InternalUserObject;
		parsedUser.isAdmin = isUserAdmin(user.Item);
		parsedUser.isActive = isUserActive(user.Item);

		return parsedUser;
	} catch (e) {
		logger.error('getLoggedInUser', e);
		return null;
	}
}
