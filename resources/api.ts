import * as AWS from 'aws-sdk';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { incrementMetric, parseDynamoDbAttributeMap } from './utils/general';

const metricSource = 'API';

const dynamodb = new AWS.DynamoDB();
const sqs = new AWS.SQS();

const statusTable = process.env.TABLE_STATUS as string;
const queueUrl = process.env.SQS_QUEUE as string;
const apiCode = process.env.SERVER_CODE as string;

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
	const action = event.queryStringParameters?.action || '';
	try {
		await incrementMetric('Call', {
			source: metricSource,
			action
		});
		switch (action) {
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
};
