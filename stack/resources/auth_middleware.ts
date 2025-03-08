import * as aws from 'aws-sdk';
import { CloudFrontRequestEvent, CloudFrontRequestResult, CloudFrontResultResponse } from 'aws-lambda';
import { allUserCookies, authTokenCookie, authUserCookie } from './utils/auth';
import { getLogger } from '../../common/logger';

const logger = getLogger('auth-mid');

interface MapOfStrings {
	[key: string]: string;
}

const redirect301: MapOfStrings = {
	'/index.html': '/',
	'/dtr.html': '/',
};

const userRequiredRoutes: string[] = [
	'/conference.html',
	'/js/conference.js',
	'/profile.html',
	'/js/profile.js',
	'/js/userConstants.js',
];

const adminRequiredRoutes: string[] = [
	'/status.html',
	'/js/status.js',
	'/js/sites_table.js',
	'/texts.html',
	'/js/texts.js',
	'/users.html',
	'/js/users.js',
];

const userTable = 'FireWatcherAwsStack-cvfdphone7155D4EA-1DZ1YV8T0PD0U';
const userTableRegion = 'us-east-2';

const dynamodb = new aws.DynamoDB({
	region: userTableRegion,
});

exports.main = async function main(event: CloudFrontRequestEvent): Promise<CloudFrontRequestResult> {
	logger.trace('main', ...arguments);
	const cfEvent = event.Records[0].cf;
	const requestUri = cfEvent.request.uri;
	const requestQueryString = cfEvent.request.querystring;

	// Handle permanently moved pages
	if (typeof redirect301[requestUri] !== 'undefined') {
		let newUrl = redirect301[requestUri];
		if (requestQueryString !== '') {
			newUrl += `?${requestQueryString}`;
		}
		return {
			status: '301',
			statusDescription: 'Found',
			headers: {
				location: [{
					key: 'Location',
					value: newUrl,
				}]
			}
		};
	}

	// Filter out pages that don't require authentication
	if (
		userRequiredRoutes.indexOf(requestUri) === -1 &&
		adminRequiredRoutes.indexOf(requestUri) === -1
	) {
		return cfEvent.request;
	}

	const currentUrl = `${requestUri}${requestQueryString === '' ? '' : `?${requestQueryString}`}`;
	const loginRedirect: CloudFrontResultResponse = {
		status: '302',
		headers: {
			location: [{
				key: 'Location',
				value: `/login.html?redirectTo=${encodeURIComponent(currentUrl)}`,
			}],
			'set-cookie': allUserCookies.map(cookie => ({
				key: 'Set-Cookie',
				value: `${cookie}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
			})),
		}
	};
	const homeRedirect: CloudFrontResultResponse = {
		status: '302',
		headers: {
			location: [{
				key: 'Location',
				value: '/',
			}],
		}
	};

	// Handle pages that require authentication
	const cookies: MapOfStrings = cfEvent.request.headers.cookie?.reduce((agg: MapOfStrings, header) => {
		const cookies = header.value.split(';')
			.map(v => v.split('='))
			.map(v => v.map(v2 => v2.trim()));

		cookies.forEach(values => {
			agg[values[0]] = values[1] || '';
		});

		return agg;
	}, {}) || {};
	if (
		typeof cookies[authUserCookie] === 'undefined' ||
		typeof cookies[authTokenCookie] === 'undefined'
	) {
		return loginRedirect;
	}

	// Get and authenticate the user
	const user = await dynamodb.getItem({
		TableName: userTable,
		Key: {
			phone: {
				N: cookies[authUserCookie],
			}
		}
	}).promise();
	if (!user.Item) {
		return loginRedirect;
	}
	const nowTime = Date.now();
	const matchingTokens = user.Item.loginTokens?.L
		?.filter(t => t.M?.token?.S === cookies[authTokenCookie])
		.map(t => parseInt(t.M?.tokenExpiry?.N || '0', 10))
		.filter(tExp => nowTime <= tExp) || [];
	if (
		!matchingTokens ||
		matchingTokens.length === 0
	) {
		return loginRedirect;
	}

	// Check that this is an active user
	if (!user.Item.isActive?.BOOL) {
		return loginRedirect;
	}

	// Check that the admin requirement is met
	if (
		adminRequiredRoutes.indexOf(requestUri) !== -1 &&
		!user.Item.isAdmin?.BOOL
	) {
		return homeRedirect;
	}

	return cfEvent.request;
}
