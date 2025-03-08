import * as aws from 'aws-sdk';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { incrementMetric, parseDynamoDbAttributeMap, randomString, validateBodyIsJson } from '../utils/general';
import { authTokenCookie, authUserCookie, getCookies, getLoggedInUser } from '../utils/auth';

const metricSource = 'User';
const loginDuration = 60 * 60 * 24 * 7; // Logins last 7 days

const dynamodb = new aws.DynamoDB();
const sqs = new aws.SQS();

const queueUrl = process.env.QUEUE_URL as string;
const userTable = process.env.TABLE_USER as string;

interface ApiResponse {
	success: boolean;
	errors: string[];
	message?: string;
	data?: any[];
}

interface CurrentUser {
	isUser: boolean;
	isAdmin: boolean;
	isDistrictAdmin: boolean;
	user: string | null;
}

async function handleLogin(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	// Validate the body
	validateBodyIsJson(event.body);

	// Parse the body
	const body = JSON.parse(event.body as string);
	const response: ApiResponse = {
		success: true,
		errors: []
	};

	// Validate the phone number
	let user: aws.DynamoDB.GetItemOutput;
	if (typeof body.phone === 'undefined') {
		response.success = false;
		response.errors.push('phone');
	} else {
		user = await dynamodb.getItem({
			TableName: userTable,
			Key: {
				phone: { N: body.phone }
			}
		}).promise();
		if (!user.Item || !user.Item.isActive.BOOL) {
			response.success = false;
			response.errors.push('phone');
		}
	}
	if (!response.success) {
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	await sqs.sendMessage({
		MessageBody: JSON.stringify({
			action: 'login',
			phone: body.phone
		}),
		QueueUrl: queueUrl
	}).promise();

	return {
		statusCode: 200,
		body: JSON.stringify(response),
		headers: {
			'Set-Cookie': `${authUserCookie}=${body.phone}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${loginDuration}`
		}
	};
}

async function handleAuth(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	// Validate the body
	validateBodyIsJson(event.body);

	// Parse the body
	const body = JSON.parse(event.body as string);
	const response: ApiResponse = {
		success: true,
		errors: []
	};

	const cookies = getCookies(event);

	// Validate the phone number
	if (typeof cookies[authUserCookie] === 'undefined') {
		response.success = false;
		response.errors.push('phone');
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}
	let user: aws.DynamoDB.GetItemOutput = await dynamodb.getItem({
		TableName: userTable,
		Key: {
			phone: { N: cookies[authUserCookie] }
		}
	}).promise();
	if (!user.Item || !user.Item.isActive?.BOOL) {
		response.success = false;
		response.errors.push('phone');
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	// Validate the code
	if (
		typeof body.code === 'undefined' ||
		body.code !== user.Item.code?.S ||
		Date.now() > parseInt(user.Item.codeExpiry?.N || '0')
	) {
		response.success = false;
		response.errors.push('code');
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	// Find previous tokens that should be deleted
	const now = Date.now();
	const validUserTokens = user.Item.loginTokens?.L
		?.filter(token => parseInt(token.M?.tokenExpiry?.N || '0') > now)
		.slice(-4) || [];

	// Create a token and attach it
	const token = randomString(32);
	const tokenExpiry = Date.now() + (loginDuration * 1000);
	validUserTokens.push({
		M: {
			token: { S: token },
			tokenExpiry: { N: tokenExpiry.toString() }
		}
	});
	await dynamodb.updateItem({
		TableName: userTable,
		Key: {
			phone: { N: cookies[authUserCookie] }
		},
		ExpressionAttributeNames: {
			'#c': 'code',
			'#ce': 'codeExpiry',
			'#t': 'loginTokens'
		},
		ExpressionAttributeValues: {
			':t': { L: validUserTokens }
		},
		UpdateExpression: 'REMOVE #c, #ce SET #t = :t'
	}).promise();

	return {
		statusCode: 200,
		body: JSON.stringify(response),
		multiValueHeaders: {
			'Set-Cookie': [
				`${authUserCookie}=${cookies[authUserCookie]}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${loginDuration}`,
				`${authTokenCookie}=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${loginDuration}`
			]
		}
	};
}

async function getUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const user = await getLoggedInUser(event);
	const response: CurrentUser = {
		isUser: false,
		isAdmin: false,
		isDistrictAdmin: false,
		user: null
	};

	if (user !== null) {
		response.isUser = true;
		response.isAdmin = !!user.isAdmin?.BOOL;
		response.isDistrictAdmin = !!user.isDistrictAdmin?.BOOL;
		response.user = user.name?.S || null;
	}

	return {
		statusCode: 200,
		body: JSON.stringify(response)
	};
}

async function handleLogout(): Promise<APIGatewayProxyResult> {
	// @TODO delete the old token if it is valid

	return {
		statusCode: 301,
		body: 'Logged Out',
		multiValueHeaders: {
			'Set-Cookie': [
				`${authUserCookie}=; Path=/; Max-Age=0`,
				`${authTokenCookie}=; Path=/; Max-Age=0`
			]
		},
		headers: {
			Location: '/'
		}
	};
}

async function handleList(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const user = await getLoggedInUser(event);
	const unathorizedResponse = {
		statusCode: 403,
		body: JSON.stringify({
			success: false,
			message: 'You are not permitted to access this area'
		})
	};
	if (
		user === null ||
		!user.isAdmin?.BOOL
	) {
		return unathorizedResponse;
	}

	// Get the users to return
	let usersItems: aws.DynamoDB.ScanOutput | aws.DynamoDB.QueryOutput;
	if (user.isDistrictAdmin?.BOOL) {
		usersItems = await dynamodb.query({
			TableName: userTable,
			IndexName: 'StationIndex',
			ExpressionAttributeNames: {
				'#n': 'name',
				'#d': 'department',
				'#p': 'phone',
				'#cs': 'callSign',
				'#active': 'isActive',
				'#admin': 'isAdmin',
				'#dadmin': 'isDistrictAdmin'
			},
			ExpressionAttributeValues: {
				':d': { S: user.department?.S }
			},
			KeyConditionExpression: '#d = :d',
			ProjectionExpression: '#n,#d,#p,#cs,#active,#admin,#dadmin'
		}).promise();
	} else {
		usersItems = await dynamodb.scan({
			TableName: userTable,
			ExpressionAttributeNames: {
				'#n': 'name',
				'#d': 'department',
				'#p': 'phone',
				'#cs': 'callSign',
				'#active': 'isActive',
				'#admin': 'isAdmin',
				'#dadmin': 'isDistrictAdmin'
			},
			ProjectionExpression: '#n,#d,#p,#cs,#active,#admin,#dadmin'
		}).promise();
	}

	// Parse the users into a readable format
	const users = (usersItems.Items || [])
		.map(parseDynamoDbAttributeMap);

	return {
		statusCode: 200,
		body: JSON.stringify({
			success: true,
			users
		})
	};
}

export async function main(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const action = event.queryStringParameters?.action || '';
	try {
		await incrementMetric('Call', {
			source: metricSource,
			action
		});
		switch (action) {
			case 'login':
				return await handleLogin(event);
			case 'auth':
				return await handleAuth(event);
			case 'getUser':
				return await getUser(event);
			case 'logout':
				return await handleLogout();
			case 'list':
				return await handleList(event);
		}

		await incrementMetric('Error', {
			source: metricSource,
			type: '404'
		});
		return {
			statusCode: 404,
			headers: {},
			body: JSON.stringify({
				error: true,
				message: `Invalid action '${action}'`
			})
		};
	} catch (e) {
		await incrementMetric('Error', {
			source: metricSource,
			type: 'general'
		});
		console.error(e);
		return {
			statusCode: 400,
			headers: {},
			body: JSON.stringify({
				error: true,
				message: (e as Error).message
			})
		};
	}
}
