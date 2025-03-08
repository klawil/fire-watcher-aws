import * as AWS from 'aws-sdk';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const dynamodb = new AWS.DynamoDB();
const sqs = new AWS.SQS();

const loginDuration = 60 * 60 * 24 * 7; // Logins last 7 days

const trafficTable = process.env.TABLE_TRAFFIC as string;
const phoneTable = process.env.TABLE_PHONE as string;
const queueUrl = process.env.SQS_QUEUE as string;
const apiCode = process.env.SERVER_CODE as string;

interface Cookies {
	[key: string]: string;
}

function getCookies(event: APIGatewayProxyEvent): Cookies {
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

function randomString(len: number, numeric = false): string {
	let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	if (numeric) {
		chars = '0123456789';
	}
	let str: string[] = [];

	for (let i = 0; i < len; i++) {
		str[i] = chars[Math.floor(Math.random() * chars.length)];
	}

	return str.join('');
}

async function getList(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const queryConfig: AWS.DynamoDB.ScanInput = {
		TableName: trafficTable
	};
	const filters: string[] = [];

	// Set the default query parameters
	event.queryStringParameters = event.queryStringParameters || {};
	event.queryStringParameters = {
		after: (Date.now() - (1000 * 60 * 60 * 24 * 28 * 2)).toString(),
		minLen: '4',
		...event.queryStringParameters
	};

	// Add the "after" parameter
	queryConfig.ExpressionAttributeValues = queryConfig.ExpressionAttributeValues || {};
	queryConfig.ExpressionAttributeValues[':after'] = {
		N: event.queryStringParameters.after
	};
	queryConfig.ExpressionAttributeNames = queryConfig.ExpressionAttributeNames || {};
	queryConfig.ExpressionAttributeNames['#dt'] = 'Datetime';
	filters.push('#dt > :after');

	// Add the length filter
	queryConfig.ExpressionAttributeValues[':minLen'] = {
		N: event.queryStringParameters.minLen
	};
	filters.push('Len >= :minLen');

	// Check for the tone filter
	if (event.queryStringParameters.tone) {
		queryConfig.ExpressionAttributeValues[':tone'] = {
			BOOL: event.queryStringParameters.tone === 'y'
		};
		filters.push('Tone = :tone');
	}

	// Add the filter strings
	if (filters.length > 0) {
		queryConfig.FilterExpression = filters.join(' and ');
	}

	const data = await dynamodb.scan(queryConfig).promise();

	// Parse the results
	const body = JSON.stringify({
		success: true,
		data: data.Items?.map((item) => Object.keys(item).reduce((coll: { [key: string]: any; }, key) => {
			if (typeof item[key].N !== 'undefined') {
				coll[key] = Number.parseFloat(item[key].N as string);
			} else if (typeof item[key].BOOL !== 'undefined') {
				coll[key] = item[key].BOOL;
			} else if (typeof item[key].S !== 'undefined') {
				coll[key] = item[key].S;
			} else {
				coll[key] = item[key];
			}

			return coll;
		}, {}))
			.sort((a, b) => a.Datetime > b.Datetime ? -1 : 1)
			.map((item) => ({
				...item,
				Source: item.Key?.split('/')[1].replace(/_\d{8}_\d{6}.*$/, '')
			}))
	});

	// Send for results
	return {
		statusCode: 200,
		headers: {},
		body
	};
}

interface ApiResponse {
	success: boolean;
	errors: string[];
	message?: string;
}

function validateBodyIsJson(body: string | null): true {
	if (body === null) {
		throw new Error(`Invalid JSON body - null`);
	}

	JSON.parse(body);

	return true;
}

interface TwilioParams {
	From: string;
	To: string;
	Body: string;
	MediaUrl0?: string;
}

async function handleMessage(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const code = event.queryStringParameters?.code || '';
	const response = {
		statusCode: 200,
		headers: {
			'Content-Type': 'application/xml'
		},
		body: '<Response></Response>'
	};

	// Validate the call is from Twilio
	if (code !== apiCode) {
		console.log('API - ERROR - INVALID CODE');
		return response;
	}

	// Validate the sending number
	const eventData = event.body
		?.split('&')
		.map((str) => str.split('=').map((str) => decodeURIComponent(str)))
		.reduce((acc, curr) => ({
			...acc,
			[curr[0]]: curr[1] || ''
		}), {}) as TwilioParams;
	const sender = await dynamodb.getItem({
		TableName: phoneTable,
		Key: {
			phone: {
				N: eventData.From.slice(2)
			}
		}
	}).promise();
	if (!sender.Item || !sender.Item.isActive.BOOL) {
		console.log(`API - ERROR - ${sender.Item ? 'Inactive' : 'Invalid'} Sender`);
		response.body = `<Response><Message>You do not have access to this text group. Contact Chief for access.</Message></Response>`;
		return response;
	}

	await sqs.sendMessage({
		MessageBody: JSON.stringify({
			action: 'twilio',
			sig: event.headers['X-Twilio-Signature'],
			body: event.body
		}),
		QueueUrl: queueUrl
	}).promise();

	return response;
}

async function handleMessageStatus(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const code = event.queryStringParameters?.code || '';
	const response = {
		statusCode: 204,
		body: ''
	};

	// Build the event data
	const eventData = event.body
		?.split('&')
		.map((str) => str.split('=').map((str) => decodeURIComponent(str)))
		.reduce((acc, curr) => ({
			...acc,
			[curr[0]]: curr[1] || ''
		}), {}) as TwilioParams;
	console.log(`TWILIO STATUS BODY: ${eventData}`);

	// Validate the call is from Twilio
	if (code !== apiCode) {
		console.log('API - ERROR - INVALID CODE');
	}

	return response;
}

async function handlePage(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	// Validate the body
	validateBodyIsJson(event.body);

	// Parse the body
	const body = JSON.parse(event.body as string);
	const response: ApiResponse = {
		success: true,
		errors: []
	};

	// Validate the body
	if (!body.code || body.code !== apiCode) {
		response.success = false;
		response.errors.push('code');
		response.errors.push('key');
	}
	if (!body.key) {
		response.success = false;
		response.errors.push('key');
	}

	if (response.success) {
		const event = {
			action: 'page',
			key: body.key
		};

		await sqs.sendMessage({
			MessageBody: JSON.stringify(event),
			QueueUrl: queueUrl
		}).promise();
	}

	return {
		statusCode: response.success ? 200 : 400,
		body: JSON.stringify(response)
	};
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
	let user: AWS.DynamoDB.GetItemOutput;
	if (typeof body.phone === 'undefined') {
		response.success = false;
		response.errors.push('phone');
	} else {
		user = await dynamodb.getItem({
			TableName: phoneTable,
			Key: {
				phone: {
					N: body.phone
				}
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
			'Set-Cookie': `cvfd-user=${body.phone}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${loginDuration}`
		}
	};
}

async function handleAuthenticate(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
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
	let user: AWS.DynamoDB.GetItemOutput;
	if (typeof cookies['cvfd-user'] === 'undefined') {
		response.success = false;
		response.errors.push('phone');
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	} else {
		user = await dynamodb.getItem({
			TableName: phoneTable,
			Key: {
				phone: {
					N: cookies['cvfd-user']
				}
			}
		}).promise();
		if (!user.Item || !user.Item.isActive.BOOL) {
			response.success = false;
			response.errors.push('phone');
			return {
				statusCode: 400,
				body: JSON.stringify(response)
			};
		}
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

	// Create a token and attach it
	const token = randomString(32);
	const tokenExpiry = Date.now() + (loginDuration * 1000);
	await dynamodb.updateItem({
		TableName: phoneTable,
		Key: {
			phone: {
				N: cookies['cvfd-user']
			}
		},
		ExpressionAttributeNames: {
			'#c': 'code',
			'#ce': 'codeExpiry',
			'#t': 'token',
			'#te': 'tokenExpiry'
		},
		ExpressionAttributeValues: {
			':t': {
				S: token
			},
			':te': {
				N: `${tokenExpiry}`
			}
		},
		UpdateExpression: 'SET #t = :t, #te = :te REMOVE #c, #ce'
	}).promise();

	return {
		statusCode: 200,
		body: JSON.stringify({
			headers: event.headers
		}),
		multiValueHeaders: {
			'Set-Cookie': [
				`cvfd-user=${cookies['cvfd-user']}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${loginDuration}`,
				`cvfd-token=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${loginDuration}`
			]
		}
	};
}

const EXPOSED_KEYS: {
	[key: string]: string | boolean
} = {
	phone: '',
	isActive: false,
	isAdmin: false,
	callSign: '',
	name: ''
};

async function listUsers(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const cookies = getCookies(event);
	const response = {
		statusCode: 403,
		body: JSON.stringify({
			success: false,
			message: 'You are not permitted to access this area'
		})
	};

	if (
		typeof cookies['cvfd-user'] === 'undefined' ||
		typeof cookies['cvfd-token'] === 'undefined'
	) {
		console.log(`Missing cookies`);
		console.log(cookies);
		return response;
	}
	const user = await dynamodb.getItem({
		TableName: phoneTable,
		Key: {
			phone: {
				N: cookies['cvfd-user']
			}
		}
	}).promise();
	if (
		!user.Item ||
		Date.now() > parseInt(user.Item.tokenExpiry?.N || '0') ||
		user.Item.token?.S !== cookies['cvfd-token']
	) {
		console.log(`Invalid token`);
		console.log(user.Item);
		console.log(Date.now());
		console.log(cookies);
		return response;
	}

	// Get the users to return
	let usersItems: AWS.DynamoDB.ItemList = [ user.Item ];
	if (user.Item.isAdmin?.BOOL) {
		usersItems = await dynamodb.scan({
			TableName: phoneTable
		}).promise()
			.then((r) => r.Items || []);
	}

	// Parse the users into a readable format
	const users = usersItems
		.map((item) => {
			let itemObj: { [key: string]: string | boolean | undefined | null } = {};

			Object.keys(EXPOSED_KEYS).forEach((key) => {
				if (typeof item[key] === 'undefined') {
					itemObj[key] = EXPOSED_KEYS[key];
					return;
				}

				itemObj[key] = item[key].S
					? item[key].S
					: item[key].N
						? item[key].N
						: item[key].BOOL
			});

			return itemObj;
		});

	return {
		statusCode: 200,
		body: JSON.stringify({
			success: true,
			users
		})
	};
}
interface ActivateApiResponse {
	success: boolean;
	errors: string[];
	data?: (string | undefined)[];
}

async function handleAllActivate(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const response: ActivateApiResponse = {
		success: true,
		errors: []
	};

	// Validate the token
	const code = event.queryStringParameters?.code || '';

	// Validate the body
	if (!code || code !== apiCode) {
		response.success = false;
		response.errors.push('code');
	}

	if (response.success) {
		const activations = await dynamodb.scan({
			TableName: phoneTable,
			FilterExpression: '#a = :a',
			ExpressionAttributeNames: {
				'#a': 'isActive'
			},
			ExpressionAttributeValues: {
				':a': {
					BOOL: false
				}
			}
		}).promise()
			.then((data) => data.Items?.map((item) => item.phone.N));
		response.data = activations;

		await Promise.all((activations || []).map((num) => sqs.sendMessage({
			MessageBody: JSON.stringify({
				action: 'activate',
				phone: num
			}),
			QueueUrl: queueUrl
		}).promise()));
	}

	return {
		statusCode: response.success ? 200 : 400,
		body: JSON.stringify(response)
	};
}

interface ApiDataResponse extends ApiResponse {
	data?: any[];
}

async function handleLocationUpdate(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	// Validate the body
	validateBodyIsJson(event.body);

	// Parse the body
	const body = JSON.parse(event.body as string);
	const response: ApiDataResponse = {
		success: true,
		errors: []
	};

	// Log the new location
	console.log(body);

	return {
		statusCode: 200,
		body: JSON.stringify(response)
	};
}

export async function main(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const action = event.queryStringParameters?.action || 'list';
	try {
		console.log(`API - CALL - ${action}`);
		switch (action) {
			case 'list':
				return await getList(event);
			case 'message':
				return await handleMessage(event);
			case 'messageStatus':
				return await handleMessageStatus(event);
			case 'page':
				return await handlePage(event);
			case 'login':
				return await handleLogin(event);
			case 'auth':
				return await handleAuthenticate(event);
			case 'listUsers':
				return await listUsers(event);
			case 'allActivate':
				return await handleAllActivate(event);
			case 'location':
				return await handleLocationUpdate(event);
		}

		console.log(`API - 404`);
		return {
			statusCode: 404,
			headers: {},
			body: JSON.stringify({
				error: true,
				message: `Invalid action '${action}'`
			})
		};
	} catch (e) {
		console.log(`API - ERROR - ${action}`);
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
};
