import * as AWS from 'aws-sdk';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { parseDynamoDbAttributeMap } from './utils';

const dynamodb = new AWS.DynamoDB();
const sqs = new AWS.SQS();

const loginDuration = 60 * 60 * 24 * 7; // Logins last 7 days

const defaultLimit = 100;

const trafficTable = process.env.TABLE_TRAFFIC as string;
const dtrTable = process.env.TABLE_DTR as string;
const talkgroupTable = process.env.TABLE_TALKGROUP as string;
const phoneTable = process.env.TABLE_PHONE as string;
const messagesTable = process.env.TABLE_MESSAGES as string;
const statusTable = process.env.TABLE_STATUS as string;
const queueUrl = process.env.SQS_QUEUE as string;
const apiCode = process.env.SERVER_CODE as string;
const s3Bucket = process.env.S3_BUCKET as string;

const ignorePrefixes = [
	'Liked',
	'Loved',
	'Disliked',
	'Laughed+at',
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

type DynamoOutput = AWS.DynamoDB.QueryOutput & {
	LastEvaluatedKeys: (AWS.DynamoDB.Key | null)[];
	MinSortKey: number | null;
	MaxSortKey: number | null;
};

async function runDynamoQueries(
	queryConfigs: AWS.DynamoDB.QueryInput[],
	sortKey: string = '',
	afterKey: string = ''
): Promise<DynamoOutput> {
	if (afterKey === '') {
		afterKey = sortKey;
	}

	const scanForward = queryConfigs[0].ScanIndexForward;
	const sortDirGreater = scanForward ? 1 : -1;
	const sortDirLesser = scanForward ? -1 : 1;

	return await Promise.all(queryConfigs.map((queryConfig) => dynamodb.query(queryConfig).promise()))
		.then((data) => data.reduce((agg: DynamoOutput, result) => {
			if (
				typeof result.Count !== 'undefined' &&
				typeof agg.Count !== 'undefined'
			) {
				agg.Count += result.Count;
			}

			if (
				typeof result.ScannedCount !== 'undefined' &&
				typeof agg.ScannedCount !== 'undefined'
			) {
				agg.ScannedCount += result.ScannedCount;
			}

			if (
				typeof result.Items !== 'undefined' &&
				typeof agg.Items !== 'undefined'
			) {
				agg.Items = [
					...agg.Items,
					...result.Items
				];
			}

			if (typeof result.LastEvaluatedKey !== 'undefined') {
				agg.LastEvaluatedKeys.push(result.LastEvaluatedKey);
			} else {
				agg.LastEvaluatedKeys.push(null);
			}

			return agg;
		}, {
			Items: [],
			Count: 0,
			ScannedCount: 0,
			LastEvaluatedKeys: [],
			MinSortKey: null,
			MaxSortKey: null
		}))
		.then((data) => {
			if (sortKey !== '') {
				data.Items = data.Items?.sort((a, b) => {
					if (
						typeof a[sortKey].N === 'undefined' ||
						typeof b[sortKey].N === 'undefined'
					) return 0;

					return Number(a[sortKey].N) > Number(b[sortKey].N)
						? sortDirGreater
						: sortDirLesser;
				});
			}

			if (typeof queryConfigs[0].Limit !== 'undefined') {
				data.Items = data.Items?.slice(0, queryConfigs[0].Limit);
				data.Count = data.Items?.length || 0;
			}

			if (sortKey !== '') {
				let minSortKey: null | number = null;
				let maxSortKey: null | number = null;
				data.Items?.forEach((item) => {
					const afterKeyValue = Number(item[afterKey].N);
					const sortKeyValue = Number(item[sortKey].N);

					if (
						minSortKey === null ||
						sortKeyValue < minSortKey
					) minSortKey = sortKeyValue;

					if (
						maxSortKey === null ||
						afterKeyValue > maxSortKey
					) maxSortKey = afterKeyValue;
				});

				data.MinSortKey = minSortKey;
				data.MaxSortKey = maxSortKey;
			}

			if (scanForward) {
				data.Items?.reverse();
			}

			return data;
		});
}

async function getList(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

	// Set the default query parameters
	event.queryStringParameters = event.queryStringParameters || {};
	event.queryStringParameters = {
		minLen: '0',
		...event.queryStringParameters
	};

	// Build the query configs
	const queryConfigs: AWS.DynamoDB.QueryInput[] = [];

	// Add the tone filters
	const toneFilters: string[] = [];
	if (event.queryStringParameters.tone) {
		toneFilters.push(event.queryStringParameters.tone === 'y' ? 'y' : 'n');
	} else {
		toneFilters.push('y', 'n');
	}
	toneFilters.forEach((tone) => {
		queryConfigs.push({
			TableName: trafficTable,
			IndexName: 'ToneIndex',
			Limit: defaultLimit,
			ScanIndexForward: false,
			ExpressionAttributeNames: {
				'#t': 'ToneIndex',
				'#l': 'Len'
			},
			ExpressionAttributeValues: {
				':t': {
					S: tone
				},
				':l': {
					N: event.queryStringParameters?.minLen
				}
			},
			KeyConditionExpression: '#t = :t',
			FilterExpression: '#l >= :l'
		});
	});

	// Check for a start scanning key
	if (typeof event.queryStringParameters.next !== 'undefined') {
		const scanningKeys: (AWS.DynamoDB.Key | undefined)[] = event.queryStringParameters.next
			.split('|')
			.map((str) => {
				if (str === '') return;

				const parts = str.split(',');
				return {
					ToneIndex: {
						S: parts[0]
					},
					Datetime: {
						N: parts[1]
					},
					Key: {
						S: parts[2]
					}
				};
			});

			queryConfigs.forEach((queryConfig, index) => {
				if (!scanningKeys[index]) return;

				queryConfig.ExclusiveStartKey = scanningKeys[index];
			});
	}

	// Check for a before
	if (
		typeof event.queryStringParameters.before !== 'undefined' &&
		!isNaN(Number(event.queryStringParameters.before))
	) {
		const before = event.queryStringParameters.before;
		queryConfigs.forEach((queryConfig) => {
			queryConfig.ExpressionAttributeNames = queryConfig.ExpressionAttributeNames || {};
			queryConfig.ExpressionAttributeValues = queryConfig.ExpressionAttributeValues || {};

			queryConfig.ExpressionAttributeNames['#dt'] = 'Datetime';
			queryConfig.ExpressionAttributeValues[':dt'] = {
				N: before
			};
			queryConfig.KeyConditionExpression += ' AND #dt < :dt';
		});
	}
	// Check for an after
	else if (
		typeof event.queryStringParameters.after !== 'undefined' &&
		!isNaN(Number(event.queryStringParameters.after))
	) {
		const after = event.queryStringParameters.after;
		queryConfigs.forEach((queryConfig) => {
			queryConfig.ExpressionAttributeNames = queryConfig.ExpressionAttributeNames || {};
			queryConfig.ExpressionAttributeValues = queryConfig.ExpressionAttributeValues || {};

			queryConfig.ExpressionAttributeNames['#dt'] = 'Datetime';
			queryConfig.ExpressionAttributeValues[':dt'] = {
				N: after
			};
			queryConfig.KeyConditionExpression += ' AND #dt > :dt';
		});
	}

	const data = await runDynamoQueries(queryConfigs, 'Datetime');

	// Parse the results
	const body = JSON.stringify({
		success: true,
		count: data.Count,
		scanned: data.ScannedCount,
		continueToken: data.LastEvaluatedKeys
			.map((item) => {
				if (item === null) return '';

				return `${item.ToneIndex.S},${item.Datetime.N},${item.Key.S}`;
			}).join('|'),
		before: data.MinSortKey,
		after: data.MaxSortKey,
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

const dtrAddedIndex: {
	[key: string]: undefined | string;
} = {
	StartTimeEmergIndex: 'AddedIndex',
	StartTimeTgIndex: undefined
};

async function getDtrList(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const filters: string[] = [];

	// Set the default query parameters
	event.queryStringParameters = event.queryStringParameters || {};

	const queryConfigs: AWS.DynamoDB.QueryInput[] = [];

	// Determine which index to use
	if (typeof event.queryStringParameters.tg !== 'undefined') {
		const talkgroups = event.queryStringParameters.tg.split('|');
		talkgroups.forEach((tg) => {
			queryConfigs.push({
				TableName: dtrTable,
				IndexName: 'StartTimeTgIndex',
				ScanIndexForward: false,
				ExpressionAttributeNames: {
					'#tg': 'Talkgroup'
				},
				ExpressionAttributeValues: {
					':tg': {
						N: tg
					}
				},
				Limit: defaultLimit,
				KeyConditionExpression: '#tg = :tg'
			});
		});
	} else {
		let emergencyValues = [ '0', '1' ];
		if (
			typeof event.queryStringParameters.emerg !== 'undefined' &&
			event.queryStringParameters.emerg === 'y'
		) {
			emergencyValues = [ '1' ];
		}

		emergencyValues.forEach((emerg) => {
			queryConfigs.push({
				TableName: dtrTable,
				IndexName: 'StartTimeEmergIndex', // dtrAddedIndex,
				ScanIndexForward: false,
				ExpressionAttributeNames: {
					'#emerg': 'Emergency'
				},
				ExpressionAttributeValues: {
					':emerg': {
						N: emerg.toString()
					}
				},
				Limit: defaultLimit,
				KeyConditionExpression: '#emerg = :emerg'
			});
		});
	}

	// Check for a start scanning key
	if (typeof event.queryStringParameters.next !== 'undefined') {
		const scanningKeys: (AWS.DynamoDB.Key | undefined)[] = event.queryStringParameters.next
			.split('|')
			.map((str) => {
				if (str === '') return;

				const parts = str.split(',');
				return {
					Emergency: {
						N: parts[0]
					},
					Talkgroup: {
						N: parts[1]
					},
					Added: {
						N: parts[2]
					}
				}
			});

		queryConfigs.forEach((queryConfig, index) => {
			if (!scanningKeys[index]) return;

			queryConfig.ExclusiveStartKey = scanningKeys[index];
		});
	}

	// Check for a before filter
	if (
		typeof event.queryStringParameters.before !== 'undefined' &&
		!isNaN(Number(event.queryStringParameters.before))
	) {
		const before = event.queryStringParameters.before;
		queryConfigs.forEach((queryConfig) => {
			queryConfig.ExpressionAttributeNames = queryConfig.ExpressionAttributeNames || {};
			queryConfig.ExpressionAttributeValues = queryConfig.ExpressionAttributeValues || {};

			queryConfig.ExpressionAttributeNames['#st'] = 'StartTime';
			queryConfig.ExpressionAttributeValues[':st'] = {
				N: before
			};
			queryConfig.KeyConditionExpression += ' AND #st < :st';
		});
	}
	// Check for an after
	else if (
		typeof event.queryStringParameters.after !== 'undefined' &&
		!isNaN(Number(event.queryStringParameters.after))
	) {
		const after = event.queryStringParameters.after;
		queryConfigs.forEach((queryConfig) => {
			const newIndexName: string | undefined = dtrAddedIndex[queryConfig.IndexName as string];
			if (newIndexName === undefined) {
				delete queryConfig.IndexName;
			} else {
				queryConfig.IndexName = newIndexName;
			}
			queryConfig.ScanIndexForward = true;

			queryConfig.ExpressionAttributeNames = queryConfig.ExpressionAttributeNames || {};
			queryConfig.ExpressionAttributeValues = queryConfig.ExpressionAttributeValues || {};

			queryConfig.ExpressionAttributeNames['#st'] = 'Added';
			queryConfig.ExpressionAttributeValues[':st'] = {
				N: after
			};
			queryConfig.KeyConditionExpression += ' AND #st > :st';
		});
	}

	// Check for a source filter
	if (typeof event.queryStringParameters.source !== 'undefined') {
		const sources = event.queryStringParameters.source.split('|');
		const localFilters: string[] = [];
		sources.forEach((source, index) => {
			localFilters.push(`contains(#src, :src${index})`);

			queryConfigs.forEach((queryConfig) => {
				queryConfig.ExpressionAttributeNames = queryConfig.ExpressionAttributeNames || {};
				queryConfig.ExpressionAttributeNames['#src'] = 'Sources';
				queryConfig.ExpressionAttributeValues = queryConfig.ExpressionAttributeValues || {};
				queryConfig.ExpressionAttributeValues[`:src${index}`] = {
					N: source
				};
			});
		});
		filters.push(`(${localFilters.join(' OR ')})`);
	}

	if (filters.length > 0) {
		queryConfigs.forEach((queryConfig) => {
			queryConfig.FilterExpression = filters.join(' AND ');
		});
	}

	const data = await runDynamoQueries(queryConfigs, 'StartTime', 'Added');

	const body = JSON.stringify({
		success: true,
		count: data.Count,
		scanned: data.ScannedCount,
		continueToken: data.LastEvaluatedKeys
			.map((item) => {
				if (item === null) return '';

				return `${item.Emergency?.N},${item.Talkgroup?.N},${item.StartTime?.N}`;
			}).join('|'),
		before: data.MinSortKey,
		after: data.MaxSortKey,
		data: data.Items
			?.map((item) => parseDynamoDbAttributeMap(item))
	});

	return {
		statusCode: 200,
		headers: {},
		body
	};
}

const dtrS3Prefix = 'audio/dtr';
async function dtrFileExists(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	validateBodyIsJson(event.body);

	const s3 = new AWS.S3();

	const files: string[] = JSON.parse(event.body as string).files;
	const badFiles: (AWS.S3.HeadObjectOutput | string)[] = await Promise.all(files
		.map(f => s3.headObject({
			Bucket: s3Bucket,
			Key: `${dtrS3Prefix}/${f}`
		}).promise()
			.catch(() => f)))
		.then(data => data.filter(f => typeof f === 'string'));

	return {
		statusCode: 200,
		headers: {},
		body: JSON.stringify(badFiles)
	};
}

async function dtrTalkgroups(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const filters: string[] = [];
	event.queryStringParameters = event.queryStringParameters || {};
	const queryConfigs: AWS.DynamoDB.QueryInput[] = [];

	const partitions = [ 'Y' ];
	if (event.queryStringParameters.all === 'y') {
		partitions.push('N');
	}

	partitions.forEach(partition => {
		queryConfigs.push({
			TableName: talkgroupTable,
			IndexName: 'InUseIndex',
			ExpressionAttributeNames: {
				'#iu': 'InUse',
				'#name': 'Name',
				'#id': 'ID',
				'#c': 'Count'
			},
			ExpressionAttributeValues: {
				':iu': {
					S: partition
				}
			},
			KeyConditionExpression: '#iu = :iu',
			ProjectionExpression: '#id,#name,#c'
		});
	});

	const data = await runDynamoQueries(queryConfigs, 'Count');

	data.Items?.map(item => {
		if (typeof item.Count === 'undefined') {
			item.Count = {
				N: '0'
			}
		}
	});

	const body = JSON.stringify({
		success: true,
		count: data.Count,
		scanned: data.ScannedCount,
		continueToken: data.LastEvaluatedKeys,
		before: data.MinSortKey,
		after: data.MaxSortKey,
		data: data.Items
			?.map(item => parseDynamoDbAttributeMap(item))
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

	if (response.success && body.key.indexOf('BG_FIRE') === -1) {
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
			case 'dtrCheck':
				return await dtrFileExists(event);
			case 'talkgroups':
				return await dtrTalkgroups(event);
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
