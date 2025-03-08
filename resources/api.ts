import * as AWS from 'aws-sdk';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { parseDynamoDbAttributeMap } from './utils';

const dynamodb = new AWS.DynamoDB();
const sqs = new AWS.SQS();

const loginDuration = 60 * 60 * 24 * 7; // Logins last 7 days

const trafficTable = process.env.TABLE_TRAFFIC as string;
const dtrTable = process.env.TABLE_DTR as string;
const phoneTable = process.env.TABLE_PHONE as string;
const messagesTable = process.env.TABLE_MESSAGES as string;
const statusTable = process.env.TABLE_STATUS as string;
const queueUrl = process.env.SQS_QUEUE as string;
const apiCode = process.env.SERVER_CODE as string;

const ignorePrefixes = [
	'Liked',
	'Loved',
	'Disliked',
	'Laughed at',
	'Questioned'
]
	.map(p => `${p}+`);

const unauthorizedResponse = {
	statusCode: 403,
	body: JSON.stringify({
		success: false,
		message: 'You are not permitted to access this area'
	})
};

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

async function getLoggedInUser(event: APIGatewayProxyEvent): Promise<null | AWS.DynamoDB.AttributeMap> {
	console.log('AUTH - CALL');

	try {
		const cookies = getCookies(event);

		// Check that there are cookies
		if (
			typeof cookies['cvfd-user'] === 'undefined' ||
			typeof cookies['cvfd-token'] === 'undefined'
		) {
			console.log('AUTH - FAILED - NO COOKIES');
			return null;
		}

		// Check that the cookies are valid
		const user = await dynamodb.getItem({
			TableName: phoneTable,
			Key: {
				phone: {
					N: cookies['cvfd-user']
				}
			}
		}).promise();
		if (!user.Item) {
			console.log('AUTH - FAILED - INVALID USER');
			return null;
		}

		const matchingTokens = user.Item.loginTokens?.L
			?.filter(t => t.M?.token?.S === cookies['cvfd-token'])
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

async function getList(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const queryConfig: AWS.DynamoDB.ScanInput = {
		TableName: trafficTable
	};
	const filters: string[] = [];

	// Set the default query parameters
	event.queryStringParameters = event.queryStringParameters || {};
	event.queryStringParameters = {
		after: (Date.now() - (1000 * 60 * 60 * 24 * 28 * 2)).toString(),
		minLen: '0',
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
			.map((item) => {
				let Source = item.Key?.split('/')[1].replace(/_\d{8}_\d{6}.*$/, '');

				if (Source === 'FIRE') {
					Source = 'SAG_FIRE_VHF';
				}

				return {
					...item,
					Source
				};
			})
	});

	// Send for results
	return {
		statusCode: 200,
		headers: {},
		body
	};
}

type WithRequiredProperty<Type, Key extends keyof Type> = Type & {
  [Property in Key]-?: Type[Property];
};

async function getDtrList(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const filters: string[] = [];

	// Set the default query parameters
	event.queryStringParameters = event.queryStringParameters || {};
	event.queryStringParameters = {
		after: (Math.round(Date.now() / 1000) - (60 * 60 * 24 * 2)).toString(),
		...event.queryStringParameters
	};

	// Add the "after" parameter
	const queryConfig: AWS.DynamoDB.ScanInput &
		WithRequiredProperty<AWS.DynamoDB.ScanInput, 'ExpressionAttributeValues'> &
		WithRequiredProperty<AWS.DynamoDB.ScanInput, 'ExpressionAttributeNames'> = {
		TableName: dtrTable,
		ExpressionAttributeValues: {
			':after': {
				N: event.queryStringParameters.after
			}
		},
		ExpressionAttributeNames: {
			'#dt': 'StartTime'
		}
	};
	filters.push('#dt > :after');

	// Check for a source filter
	if (typeof event.queryStringParameters.source !== 'undefined') {
		const sources = event.queryStringParameters.source.split('|');
		const localFilters: string[] = [];
		queryConfig.ExpressionAttributeNames['#src'] = 'Sources';
		sources.forEach((source, index) => {
			localFilters.push(`contains(#src, :src${index})`);
			queryConfig.ExpressionAttributeValues[`:src${index}`] = {
				N: source
			};
		});
		filters.push(`(${localFilters.join(' OR ')})`);
	}

	// Check for a talkgroup filter
	if (typeof event.queryStringParameters.tg !== 'undefined') {
		const talkgroups = event.queryStringParameters.tg.split('|');
		const localFilters: string[] = [];
		queryConfig.ExpressionAttributeNames['#tg'] = 'Talkgroup';
		talkgroups.forEach((tg, index) => {
			localFilters.push(`#tg = :tg${index}`);
			queryConfig.ExpressionAttributeValues[`:tg${index}`] = {
				N: tg
			};
		});
		filters.push(`(${localFilters.join(' OR ')})`);
	}

	if (filters.length > 0) {
		queryConfig.FilterExpression = filters.join(' AND ');
	}

	const data = await dynamodb.scan(queryConfig).promise();
	const body = JSON.stringify({
		success: true,
		data: data.Items
			?.map((item) => parseDynamoDbAttributeMap(item))
			.sort((a, b) => (a.datetime as number) > (b.datetime as number) ? -1 : 1),
		query: queryConfig.FilterExpression,
		values: queryConfig.ExpressionAttributeValues
	});

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
	data?: any[]
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

interface TextCommand {
	ExpressionAttributeNames: AWS.DynamoDB.ExpressionAttributeNameMap;
	ExpressionAttributeValues?: AWS.DynamoDB.ExpressionAttributeValueMap;
	UpdateExpression: string;
}

const textCommands: {
	[key: string]: TextCommand;
} = {
	'!startTest': {
		ExpressionAttributeNames: {
			'#isTest': 'isTest'
		},
		ExpressionAttributeValues: {
			':isTest': {
				BOOL: true
			}
		},
		UpdateExpression: 'SET #isTest = :isTest'
	},
	'!stopTest': {
		ExpressionAttributeNames: {
			'#isTest': 'isTest'
		},
		UpdateExpression: 'REMOVE #isTest'
	},
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

	// Check for text commands and apple responses
	const isTextCommand = typeof textCommands[eventData.Body] !== 'undefined';
	const isAppleResponse = ignorePrefixes
		.reduce((bool, prefix) => bool || eventData.Body.indexOf(prefix) === 0, false);

	if (isTextCommand) {
		console.log(`API - COMMAND - ${sender.Item.phone.N}`);
		await dynamodb.updateItem({
			TableName: phoneTable,
			Key: {
				phone: {
					N: sender.Item.phone.N
				}
			},
			...textCommands[eventData.Body]
		}).promise();

		response.body = `<Response><Message>Text command processed</Message></Response>`;
	} else if (isAppleResponse) {
		console.log(`API - APPLE - ${sender.Item.phone.N}`);
	} else {
		await sqs.sendMessage({
			MessageBody: JSON.stringify({
				action: 'twilio',
				sig: event.headers['X-Twilio-Signature'],
				body: event.body
			}),
			QueueUrl: queueUrl
		}).promise();
	}

	return response;
}

interface TwilioMessageStatus {
	SmsSid: string;
	SmsStatus: string;
	MessageStatus: string; // Use me!
	To: string;
	MessageSid: string;
	AccountSid: string;
	From: string;
	ApiVersion: string;
}

async function handleMessageStatus(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const eventDatetime = Date.now();
	const code = event.queryStringParameters?.code || '';
	const messageId = event.queryStringParameters?.msg || null;
	const response = {
		statusCode: 204,
		body: ''
	};

	// Validate the call is from Twilio
	if (code !== apiCode) {
		console.log('API - ERROR - INVALID CODE');
	} else if (messageId === null) {
		console.log('API - ERROR - INVALID MESSAGE ID');
	} else {
		// Build the event data
		const eventData = event.body
			?.split('&')
			.map((str) => str.split('=').map((str) => decodeURIComponent(str)))
			.reduce((acc, curr) => ({
				...acc,
				[curr[0]]: curr[1] || ''
			}), {}) as TwilioMessageStatus;

		await dynamodb.updateItem({
			TableName: messagesTable,
			Key: {
				datetime: {
					N: messageId
				}
			},
			ExpressionAttributeNames: {
				'#eventName': eventData.MessageStatus,
				'#eventPhoneList': `${eventData.MessageStatus}Phone`,
				'#from': 'fromNumber'
			},
			ExpressionAttributeValues: {
				':eventListItem': {
					NS: [
						eventDatetime.toString()
					]
				},
				':eventPhoneListItem': {
					SS: [
						eventData.To
					]
				},
				':from': {
					S: eventData.From
				}
			},
			UpdateExpression: 'ADD #eventName :eventListItem, #eventPhoneList :eventPhoneListItem SET #from = :from'
		}).promise();
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
	if (typeof cookies['cvfd-user'] === 'undefined') {
		response.success = false;
		response.errors.push('phone');
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}
	let user: AWS.DynamoDB.GetItemOutput = await dynamodb.getItem({
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
		?.filter(token => parseInt(token.M?.tokenExpiry?.N || '0') > now) || [];

	// Create a token and attach it
	const token = randomString(32);
	const tokenExpiry = Date.now() + (loginDuration * 1000);
	validUserTokens.push({
		M: {
			token: {
				S: token
			},
			tokenExpiry: {
				N: tokenExpiry.toString()
			}
		}
	});
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
			'#t': 'loginTokens'
		},
		ExpressionAttributeValues: {
			':t': {
				L: validUserTokens
			}
		},
		UpdateExpression: `REMOVE #c, #ce SET #t = :t`
	}).promise();

	return {
		statusCode: 200,
		body: JSON.stringify(response),
		multiValueHeaders: {
			'Set-Cookie': [
				`cvfd-user=${cookies['cvfd-user']}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${loginDuration}`,
				`cvfd-token=${token}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${loginDuration}`
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
	const user = await getLoggedInUser(event);
	if (user === null) {
		return unauthorizedResponse;
	}

	// Get the users to return
	let usersItems: AWS.DynamoDB.ItemList = [ user ];
	if (user.isAdmin?.BOOL) {
		usersItems = await dynamodb.scan({
			TableName: phoneTable
		}).promise()
			.then((r) => r.Items || []);
	}

	// Parse the users into a readable format
	const users = usersItems
		.map((item) => {
			let itemObj = parseDynamoDbAttributeMap(item);

			Object.keys(itemObj)
				.filter(key => typeof EXPOSED_KEYS[key] === 'undefined')
				.forEach(key => delete itemObj[key]);

			Object.keys(EXPOSED_KEYS)
				.filter(key => typeof itemObj[key] === 'undefined')
				.forEach(key => itemObj[key] = EXPOSED_KEYS[key]);

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

async function getTexts(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const user = await getLoggedInUser(event);
	if (user === null) {
		return unauthorizedResponse;
	}

	const getAfter = Date.now() - (1000 * 60 * 60 * 24 * 60);
	const result = await dynamodb.scan({
		TableName: messagesTable,
		FilterExpression: '#dt >= :dt',
		ExpressionAttributeValues: {
			':dt': {
				N: getAfter.toString()
			}
		},
		ExpressionAttributeNames: {
			'#dt': 'datetime'
		}
	}).promise();

	return {
		statusCode: 200,
		headers: {},
		body: JSON.stringify({
			success: true,
			data: (result.Items || []).map(parseDynamoDbAttributeMap)
		})
	};
}

interface CurrentUserAPIResponse {
	isUser: boolean;
	isAdmin: boolean;
	user: string | null;
}

async function getUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const user = await getLoggedInUser(event);
	const response: CurrentUserAPIResponse = {
		isUser: false,
		isAdmin: false,
		user: null
	};

	if (user !== null) {
		response.isUser = true;
		response.isAdmin = !!user.isAdmin?.BOOL;
		response.user = user.name?.S || null;
	}

	return {
		statusCode: 200,
		body: JSON.stringify(response)
	};
}

interface HeartbeatBody {
	code: string;
	Server: string;
	Program: string;
	IsPrimary: boolean;
	IsActive: boolean;
}

async function handleHeartbeat(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	// Validate the body
	validateBodyIsJson(event.body);

	// Parse the body
	const body = JSON.parse(event.body as string) as HeartbeatBody;
	const response: ApiResponse = {
		success: true,
		errors: []
	};

	// Validate the body
	if (!body.code || body.code !== apiCode) {
		response.success = false;
		response.errors.push('code');
	}
	const neededFields: { [key in keyof HeartbeatBody]?: string } = {
		Server: 'string',
		Program: 'string',
		IsPrimary: 'boolean',
		IsActive: 'boolean'
	};
	Object.keys(neededFields)
		.forEach(key => {
			if (typeof body[key as keyof HeartbeatBody] !== neededFields[key as keyof HeartbeatBody]) {
				response.errors.push(key);
				response.success = false;
			}
		});
	
	if (!response.success) {
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	await dynamodb.updateItem({
		TableName: statusTable,
		Key: {
			ServerProgram: {
				S: `${body.Server}:${body.Program}`
			},
			Program: {
				S: body.Program
			}
		},
		ExpressionAttributeNames: {
			'#s': 'Server',
			'#ip': 'IsPrimary',
			'#ia': 'IsActive',
			'#lh': 'LastHeartbeat'
		},
		ExpressionAttributeValues: {
			':s': { S: body.Server },
			':ip': { BOOL: body.IsPrimary },
			':ia': { BOOL: body.IsActive },
			':lh': { N: `${Date.now()}` }
		},
		UpdateExpression: 'SET #s = :s, #ip = :ip, #ia = :ia, #lh = :lh'
	}).promise();

	response.data = await dynamodb.scan({
		TableName: statusTable,
		ExpressionAttributeValues: {
			':p': {
				S: body.Program
			}
		},
		ExpressionAttributeNames: {
			'#p': 'Program'
		},
		FilterExpression: '#p = :p'
	}).promise()
		.then(data => (data.Items || []).map(parseDynamoDbAttributeMap));
	
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
			case 'dtr':
				return await getDtrList(event);
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
			case 'getTexts':
				return await getTexts(event);
			case 'getUser':
				return await getUser(event);
			case 'heartbeat':
				return await handleHeartbeat(event);
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
