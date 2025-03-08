import * as aws from 'aws-sdk';
import { APIGatewayProxyEvent } from 'aws-lambda';

const dynamodb = new aws.DynamoDB();

export const authUserCookie = 'cvfd-user';
export const authTokenCookie = 'cvfd-token';

const userTable = process.env.TABLE_USER as string;

interface Cookies {
	[key: string]: string;
}

export function getCookies(event: APIGatewayProxyEvent): Cookies {
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
	console.log('AUTH - CALL');

	try {
		const cookies = getCookies(event);

		// Check that the auth cookies are present
		if (
			typeof cookies[authUserCookie] === 'undefined' ||
			typeof cookies[authTokenCookie] === 'undefined'
		) {
			console.log('AUTH - FAILED - NO COOKIES');
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
			console.log('AUTH - FAILED - INVALID USER');
			return null;
		}

		const matchingTokens = user.Item.loginTokens?.L
			?.filter(t => t.M?.token?.S === cookies[authTokenCookie])
			.map(t => parseInt(t.M?.tokenExpiry?.N || '0', 10));
		
		if (!matchingTokens || matchingTokens.length === 0) {
			console.log('AUTH - FAILED - INVALID TOKEN');
			return null;
		}

		if (Date.now() > matchingTokens[0]) {
			console.log('AUTH - FAILED - EXPIRED TOKEN');
			return null;
		}

		return user.Item;
	} catch (e) {
		console.log('AUTH - FAILED - ERROR');
		console.log('API - ERROR - getLoggedInUser');
		console.error(e);
		return null;
	}
}
