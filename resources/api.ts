import * as AWS from 'aws-sdk';
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

const dynamodb = new AWS.DynamoDB();
const sqs = new AWS.SQS();

const trafficTable = process.env.TABLE_TRAFFIC as string;
const phoneTable = process.env.TABLE_PHONE as string;
const queueUrl = process.env.SQS_QUEUE as string;
const apiCode = process.env.SERVER_CODE as string;

async function getList(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
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

function validateBodyIsJson(body: string | undefined): true | APIGatewayProxyResultV2 {
	const errorBody: ApiResponse = {
		success: false,
		message: 'Invalid API format',
		errors: []
	};
	const errorResponse: APIGatewayProxyResultV2 = {
		statusCode: 400,
		body: JSON.stringify(errorBody)
	};

	if (!body) {
		return errorResponse;
	}

	try {
		JSON.parse(body);
	} catch (e) {
		return errorResponse;
	}

	return true;
}

interface TwilioParams {
	From: string;
	To: string;
	Body: string;
	MediaUrl0?: string;
}

async function handleMessage(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
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
		console.log('TWILIO FAILED CODE');
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
		console.log(`API - TWILIO - ERROR - ${sender.Item ? 'Inactive' : 'Invalid'} Sender`);
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

async function handlePage(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
	// Validate the body
	const bodyValidResponse = validateBodyIsJson(event.body);
	if (bodyValidResponse !== true) {
		return bodyValidResponse;
	}

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

interface ActivateApiResponse {
	success: boolean;
	errors: string[];
	data?: (string | undefined)[];
}

async function handleAllActivate(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
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

export async function main(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
	try {
		const action = event.queryStringParameters?.action || 'list';
		switch (action) {
			case 'list':
				return getList(event);
			case 'message':
				return handleMessage(event);
			case 'page':
				return handlePage(event);
			case 'allActivate':
				return handleAllActivate(event);
		}

		return {
			statusCode: 404,
			headers: {},
			body: JSON.stringify({
				error: true,
				message: `Invalid action '${action}'`
			})
		};
	} catch (e) {
		const body = {
			error: true,
			message: JSON.stringify(e, null, 2)
		};
		return {
			statusCode: 400,
			headers: {},
			body: JSON.stringify(body)
		};
	}
};
