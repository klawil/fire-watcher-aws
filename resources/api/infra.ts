import * as aws from 'aws-sdk';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const dynamodb = new aws.DynamoDB();
const sqs = new aws.SQS();

const apiCode = process.env.SERVER_CODE as string;
const sqsQueue = process.env.SQS_QUEUE as string;
const userTable = process.env.TABLE_USER as string;

interface TwilioEvent {
	From: string;
	To: string;
	Body: string;
	MediaUrl0?: string;
}

interface TextCommand {
	response: string;
	update: {
		ExpressionAttributeNames: aws.DynamoDB.ExpressionAttributeNameMap;
		ExpressionAttributeValues?: aws.DynamoDB.ExpressionAttributeValueMap;
		UpdateExpression: string;
	};
};

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
		console.log(`API - INFRA - ERROR - INVALID CODE`);
		return response;
	}

	// Validate the sending number
	const eventData = event.body?.split('&')
		.map(str => str.split('=').map(str => decodeURIComponent(str)))
		.reduce((acc, curr) => ({
			...acc,
			[curr[0]]: curr[1] || ''
		}), {}) as TwilioEvent;
	const sender = await dynamodb.getItem({
		TableName: userTable,
		Key: {
			phone: {
				N: eventData.From.slice(2)
			}
		}
	}).promise();
	if (!sender.Item || !sender.Item.isActive.BOOL) {
		console.log(`API - INFRA - ERROR - ${sender.Item ? 'Inactive' : 'Invalid'} Sender`);
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
		console.log(`API - INFRA - COMMAND - ${sender.Item.phone.N}`);
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
		console.log(`API - INFRA - APPLE - ${sender.Item.phone.N}`);
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

export async function main(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const action = event.queryStringParameters?.action;

	try {
		switch (action) {
			case 'text':
				return await handleText(event);
		}

		console.log(`API - INFRA - 404`);
		return {
			statusCode: 404,
			headers: {},
			body: JSON.stringify({
				error: true,
				message: `Invalid action '${action}'`
			})
		};
	} catch (e) {
		console.log(`API - INFRA - ERROR - ${action}`);
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
