import * as aws from 'aws-sdk';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { incrementMetric, parseDynamoDbAttributeMap, validateBodyIsJson } from '../utils';

const metricSource = 'Infra';

const dynamodb = new aws.DynamoDB();
const sqs = new aws.SQS();

const apiCode = process.env.SERVER_CODE as string;
const sqsQueue = process.env.SQS_QUEUE as string;
const userTable = process.env.TABLE_USER as string;
const textTable = process.env.TABLE_TEXT as string;
const statusTable = process.env.TABLE_STATUS as string;

interface TwilioTextEvent {
	From: string;
	To: string;
	Body: string;
	MediaUrl0?: string;
}

interface TwilioStatusEvent {
	SmsSid: string;
	SmsStatus: string;
	MessageStatus: string; // Use me!
	To: string;
	MessageSid: string;
	AccountSid: string;
	From: string;
	ApiVersion: string;
}

interface TextCommand {
	response: string;
	update: {
		ExpressionAttributeNames: aws.DynamoDB.ExpressionAttributeNameMap;
		ExpressionAttributeValues?: aws.DynamoDB.ExpressionAttributeValueMap;
		UpdateExpression: string;
	};
};

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

const textCommands: {
	[key: string]: TextCommand;
} = {
	'!startTest': {
		response: 'Testing mode enabled',
		update: {
			ExpressionAttributeNames: {
				'#it': 'isTest'
			},
			ExpressionAttributeValues: {
				':it': {
					BOOL: true
				}
			},
			UpdateExpression: 'SET #it = :it'
		}
	},
	'!endTest': {
		response: 'Testing mode disabled',
		update: {
			ExpressionAttributeNames: {
				'#it': 'isTest'
			},
			UpdateExpression: 'REMOVE #it'
		}
	}
};

const applePrefixes = [
	'Liked',
	'Loved',
	'Disliked',
	'Laughed+at',
	'Questioned'
]
	.map(p => `${p}+`);

async function handleText(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const code = event.queryStringParameters?.code;
	const response: APIGatewayProxyResult = {
		statusCode: 200,
		headers: {
			'Content-Type': 'application/xml'
		},
		body: '<Response></Response>'
	};

	// Validate the call is from Twilio
	if (code !== apiCode) {
		await incrementMetric('Error', {
			source: metricSource,
			type: 'handleText',
			reason: 'Invalid Code'
		});
		return response;
	}

	// Validate the sending number
	const eventData = event.body?.split('&')
		.map(str => str.split('=').map(str => decodeURIComponent(str)))
		.reduce((acc, curr) => ({
			...acc,
			[curr[0]]: curr[1] || ''
		}), {}) as TwilioTextEvent;
	const sender = await dynamodb.getItem({
		TableName: userTable,
		Key: {
			phone: {
				N: eventData.From.slice(2)
			}
		}
	}).promise();
	if (!sender.Item || !sender.Item.isActive.BOOL) {
		await incrementMetric('Error', {
			source: metricSource,
			type: 'handleText',
			reason: `${sender.Item ? 'Inactive' : 'Invalid'} Sender`
		});
		response.body = `<Response><Message>You do not have access to this text group. Contact your station chief to request access.</Message></Response>`
		return response;
	}

	// Check for text commands and apple responses
	const isTextCommand = typeof textCommands[eventData.Body] !== 'undefined';
	const isAppleResponse = applePrefixes
		.filter(prefix => eventData.Body.indexOf(prefix) === 0)
		.length > 0;

	// Handle text commands
	if (isTextCommand) {
		await incrementMetric('Event', {
			source: metricSource,
			type: 'handleText',
			event: 'command'
		});
		await dynamodb.updateItem({
			TableName: userTable,
			Key: {
				phone: {
					N: sender.Item.phone.N
				}
			},
			...textCommands[eventData.Body].update
		}).promise();

		response.body = `<Response><Message>${textCommands[eventData.Body].response}</Message></Response>`;
	} else if (isAppleResponse) {
		await incrementMetric('Event', {
			source: metricSource,
			type: 'handleText',
			event: 'apple'
		});
	} else {
		await sqs.sendMessage({
			MessageBody: JSON.stringify({
				action: 'twilio',
				sig: event.headers['X-Twilio-Signature'],
				body: event.body
			}),
			QueueUrl: sqsQueue
		}).promise();
	}

	return response;
}

async function handleTextStatus(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const eventDatetime = Date.now();
	const code = event.queryStringParameters?.code;
	const messageId = event.queryStringParameters?.msg || null;
	const response: APIGatewayProxyResult = {
		statusCode: 204,
		body: ''
	};

	// Validate the call is from Twilio
	if (code !== apiCode) {
		await incrementMetric('Error', {
			source: metricSource,
			type: 'handleTextStatus',
			reason: 'Invalid Code'
		});
	} else if (messageId === null) {
		await incrementMetric('Error', {
			source: metricSource,
			type: 'handleTextStatus',
			reason: 'Invalid Message'
		});
	} else {
		const eventData = event.body?.split('&')
			.map(str => str.split('=').map(str => decodeURIComponent(str)))
			.reduce((agg, curr) => ({
				...agg,
				[curr[0]]: curr[1] || ''
			}), {}) as TwilioStatusEvent;

		await dynamodb.updateItem({
			TableName: textTable,
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
		const event = {
			action: 'page',
			key: body.key
		};

		await sqs.sendMessage({
			MessageBody: JSON.stringify(event),
			QueueUrl: sqsQueue
		}).promise();
	} else {
		await incrementMetric('Error', {
			source: metricSource,
			type: 'handlePage',
			reason: 'Invalid Code or Key'
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
			source: metricSource,
			type: 'handleHeartbeat',
			reason: 'Invalid Body'
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

export async function main(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const action = event.queryStringParameters?.action || '';

	try {
		await incrementMetric('Call', {
			source: metricSource,
			action
		});
		switch (action) {
			case 'text':
				return await handleText(event);
			case 'textStatus':
				return await handleTextStatus(event);
			case 'page':
				return await handlePage(event);
			case 'heartbeat':
				return await handleHeartbeat(event);
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
