import * as aws from 'aws-sdk';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { incrementMetric, parseDynamoDbAttributeMap, validateBodyIsJson } from '../utils/general';

const metricSource = 'Infra';

const dynamodb = new aws.DynamoDB();
const sqs = new aws.SQS();
const cloudWatch = new aws.CloudWatch();

const apiCode = process.env.SERVER_CODE as string;
const s3Bucket = process.env.S3_BUCKET as string;
const sqsQueue = process.env.SQS_QUEUE as string;
const dtrTable = process.env.TABLE_DTR as string;
const vhfTable = process.env.TABLE_VHF as string;
const userTable = process.env.TABLE_USER as string;
const textTable = process.env.TABLE_TEXT as string;
const statusTable = process.env.TABLE_STATUS as string;

interface GenericApiResponse {
	success: boolean;
	errors: string[];
	message?: string;
	data?: any[];
}

interface HeartbeatBody {
	code: string;
	Server: string;
	Program: string;
	IsPrimary: boolean;
	IsActive: boolean;
}

async function handlePage(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	// Validate the body
	validateBodyIsJson(event.body);

	// Parse the body
	const body = JSON.parse(event.body as string);
	const response: GenericApiResponse = {
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
		const sqsEvent = {
			action: event.queryStringParameters?.action,
			key: body.key,
			isTest: !!body.isTest
		};
		response.data = [ sqsEvent ];

		await sqs.sendMessage({
			MessageBody: JSON.stringify(sqsEvent),
			QueueUrl: sqsQueue
		}).promise();
	} else {
		await incrementMetric('Error', {
			source: metricSource
		});
	}

	return {
		statusCode: response.success ? 200 : 400,
		body: JSON.stringify(response)
	};
}

async function handleHeartbeat(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	// Validate the body
	validateBodyIsJson(event.body);

	// Parse the body
	const body = JSON.parse(event.body as string) as HeartbeatBody;
	const response: GenericApiResponse = {
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
	(Object.keys(neededFields) as (keyof HeartbeatBody)[])
		.forEach(key => {
			if (typeof body[key] !== neededFields[key]) {
				response.errors.push(key);
				response.success = false;
			}
		});

	if (!response.success) {
		await incrementMetric('Error', {
			source: metricSource
		});
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
			':lh': { N: Date.now().toString() }
		},
		UpdateExpression: 'SET #s = :s, #ip = :ip, #ia = :ia, #lh = :lh'
	}).promise();

	response.data = await dynamodb.scan({
		TableName: statusTable,
		ExpressionAttributeNames: {
			'#p': 'Program'
		},
		ExpressionAttributeValues: {
			':p': { S: body.Program }
		},
		FilterExpression: '#p = :p'
	}).promise()
		.then(data => data.Items || [])
		.then(data => data.map(parseDynamoDbAttributeMap));

	return {
		statusCode: 200,
		body: JSON.stringify(response)
	};
}

async function handleDtrExists(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	validateBodyIsJson(event.body);

	const s3 = new aws.S3();

	const files: string[] = JSON.parse(event.body as string).files;
	const badFiles: string[] = await Promise.all(files
		.map(f => s3.headObject({
			Bucket: s3Bucket,
			Key: `audio/dtr/${f}`
		}).promise().catch(() => f)))
		.then(data => data.filter(f => typeof f === 'string') as string[]);

	return {
		statusCode: 200,
		headers: {},
		body: JSON.stringify(badFiles)
	};
}

async function handleDtrExistsSingle(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	event.queryStringParameters = event.queryStringParameters || {};
	const response: GenericApiResponse & {
		exists: boolean;
	} = {
		success: true,
		exists: false,
		errors: []
	};
	
	// Validate the query parameters
	if (
		!event.queryStringParameters.tg ||
		!/^[0-9]+$/.test(event.queryStringParameters.tg)
	) {
		response.errors.push('tg');
	}
	if (
		!event.queryStringParameters.start ||
		!/^[0-9]+$/.test(event.queryStringParameters.start)
	) {
		response.errors.push('start');
	}
	if (response.errors.length > 0) {
		response.success = false;
		await incrementMetric('Error', {
			source: metricSource
		});
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	// Find the item
	const result = await dynamodb.query({
		TableName: dtrTable,
		IndexName: 'StartTimeTgIndex',
		ExpressionAttributeNames: {
			'#tg': 'Talkgroup',
			'#st': 'StartTime'
		},
		ExpressionAttributeValues: {
			':tg': {
				N: event.queryStringParameters.tg
			},
			':st': {
				N: event.queryStringParameters.start
			}
		},
		KeyConditionExpression: '#tg = :tg AND #st = :st'
	}).promise();
	response.exists = typeof result.Items !== 'undefined'
		&& result.Items.length > 0;

	return {
		statusCode: 200,
		body: JSON.stringify(response)
	};
}

const testingUser = '***REMOVED***';
async function handleTestState(event: APIGatewayProxyEvent, testOn: boolean): Promise<APIGatewayProxyResult> {
	const response: GenericApiResponse = {
		success: true,
		errors: []
	};

	// Validate the code
	event.queryStringParameters = event.queryStringParameters || {};
	if (event.queryStringParameters.code !== apiCode) {
		response.success = false;
		response.errors.push('auth');
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	// Update the user
	const updateConfig: aws.DynamoDB.UpdateItemInput = {
		TableName: userTable,
		Key: {
			phone: { N: testingUser }
		},
		ExpressionAttributeNames: {
			'#it': 'isTest'
		},
		ExpressionAttributeValues: {
			':it': { BOOL: true }
		},
		UpdateExpression: 'SET #it = :it'
	};
	if (!testOn) {
		delete updateConfig.ExpressionAttributeValues;
		updateConfig.UpdateExpression = 'REMOVE #it';
	}

	await dynamodb.updateItem(updateConfig).promise();

	return {
		statusCode: 200,
		body: JSON.stringify(response)
	};
}

async function getTestTexts(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const response: GenericApiResponse = {
		success: true,
		errors: []
	};

	// Validate the code
	event.queryStringParameters = event.queryStringParameters || {};
	if (event.queryStringParameters.code !== apiCode) {
		response.success = false;
		response.errors.push('auth');
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	// Retrieve the texts
	const result = await dynamodb.query({
		TableName: textTable,
		IndexName: 'isTestIndex',
		Limit: 10,
		ScanIndexForward: false,
		ExpressionAttributeNames: {
			'#its': 'isTestString'
		},
		ExpressionAttributeValues: {
			':its': { S: 'y' }
		},
		KeyConditionExpression: '#its = :its'
	}).promise();
	response.data = result.Items?.map(parseDynamoDbAttributeMap);

	return {
		statusCode: 200,
		headers: {},
		body: JSON.stringify(response)
	};
}

async function handleMetrics(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const date = new Date();
	const response: GenericApiResponse = {
		success: true,
		errors: []
	};

	// Validate the code
	event.queryStringParameters = event.queryStringParameters || {};
	if (event.queryStringParameters.code !== apiCode) {
		response.success = false;
		response.errors.push('auth');
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	// Validate the body
	validateBodyIsJson(event.body);

	// Parse the body
	const body = JSON.parse(event.body as string) as {
		type: string;
		data: {
			id: string;
			val: number;
		}[];
	};
	
	// Validate the body
	if (!body.type || typeof body.type !== 'string') {
		response.errors.push('type');
	}
	if (
		!body.data ||
		!Array.isArray(body.data) ||
		body.data.filter(i => typeof i.id !== 'string' || typeof i.val !== 'number').length > 0
	) {
		response.errors.push('data');
	}

	if (response.errors.length > 0) {
		response.success = false;
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	const putConfig: aws.CloudWatch.PutMetricDataInput = {
		Namespace: 'DTR Metrics',
		MetricData: body.data.map(i => ({
			MetricName: body.type,
			Dimensions: [ {
				Name: 'Tower',
				Value: i.id
			} ],
			Timestamp: date,
			Unit: 'Count',
			Value: i.val
		}))
	};
	await cloudWatch.putMetricData(putConfig).promise();

	return {
		statusCode: 200,
		body: JSON.stringify(response)
	};
}

async function handleMetricsFE(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const date = new Date();
	const response: GenericApiResponse = {
		success: true,
		errors: []
	};

	// Validate the body
	validateBodyIsJson(event.body);

	// Parse the body
	const body = JSON.parse(event.body as string) as {
		cs: number;
		f: string;
	};

	// Validate the body
	if (!body.cs || typeof body.cs !== 'number') {
		response.errors.push('cs');
	}
	if (!body.f || typeof body.f !== 'string') {
		response.errors.push('f');
	}

	if (response.errors.length > 0) {
		response.success = false;
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	const result = await dynamodb.query({
		TableName: vhfTable,
		ExpressionAttributeNames: {
			'#k': 'Key'
		},
		ExpressionAttributeValues: {
			':k': {
				S: `audio/${body.f}`
			}
		},
		KeyConditionExpression: '#k = :k'
	}).promise();
	if (!result.Items || result.Items.length === 0) {
		response.errors.push(`"f" is not a valid key`);
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	if (
		result.Items[0].csLooked &&
		result.Items[0].csLooked.NS &&
		result.Items[0].csLooked.NS.indexOf(`${body.cs}`) !== -1
	) {
		response.data = [ 'Done already' ];
		return {
			statusCode: 200,
			body: JSON.stringify(response)
		};
	}

	// Update the item
	let updateExpression = 'ADD #csLooked :csLooked, #csLookedTime :csLookedTime';
	if (!result.Items[0].csLooked) {
		updateExpression = 'SET #csLooked = :csLooked, #csLookedTime = :csLookedTime';
	}
	await dynamodb.updateItem({
		TableName: vhfTable,
		Key: {
			Key: result.Items[0].Key,
			Datetime: result.Items[0].Datetime
		},
		ExpressionAttributeNames: {
			'#csLooked': 'csLooked',
			'#csLookedTime': 'csLookedTime'
		},
		ExpressionAttributeValues: {
			':csLooked': {
				NS: [
					`${body.cs}`
				]
			},
			':csLookedTime': {
				NS: [
					`${date.getTime()}`
				]
			}
		},
		UpdateExpression: updateExpression
	}).promise();

	return {
		statusCode: 200,
		body: JSON.stringify(response)
	};
}

export async function main(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const action = event.queryStringParameters?.action || 'none';

	try {
		if (action !== 'metric') {
			await incrementMetric('Call', {
				source: metricSource,
				action
			}, true, false);
		}
		switch (action) {
			case 'page':
			case 'dtrPage':
				return await handlePage(event);
			case 'heartbeat':
				return await handleHeartbeat(event);
			case 'dtrExists':
				return await handleDtrExists(event);
			case 'dtrExistsSingle':
				return await handleDtrExistsSingle(event);
			case 'startTest':
				return await handleTestState(event, true);
			case 'endTest':
				return await handleTestState(event, false);
			case 'getTexts':
				return await getTestTexts(event);
			case 'metric':
				return await handleMetrics(event);
			case 'metricFE':
				return await handleMetricsFE(event);
		}

		await incrementMetric('Error', {
			source: metricSource
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
			source: metricSource
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
