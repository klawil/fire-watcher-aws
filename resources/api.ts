import * as AWS from 'aws-sdk';
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import * as captcha from 'svg-captcha';

const dynamodb = new AWS.DynamoDB();
const sqs = new AWS.SQS();

const trafficTable = process.env.TABLE_TRAFFIC as string;
const captchaTable = process.env.TABLE_CAPTCHA as string;
const phoneTable = process.env.TABLE_PHONE as string;
const queueUrl = process.env.SQS_QUEUE as string;
const apiCode = process.env.SERVER_CODE as string;

const captchaTtl = 1000 * 60 * 5;
const phoneRegex = /^[0-9]{3}-[0-9]{3}-[0-9]{4}$/;

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

async function createCaptcha(): Promise<APIGatewayProxyResultV2> {
	const newCaptcha = captcha.create({
		noise: 3
	});
	const id = randomString(10);
	const timeout = Math.ceil((Date.now() + captchaTtl) / 1000); // 5 minutes in the future in seconds
	
	// Save the captcha in DynamoDB
	const body: AWS.DynamoDB.PutItemInput = {
		TableName: captchaTable,
		Item: {
			CaptchaId: {
				S: id
			},
			ExpTime: {
				N: timeout.toString()
			},
			Answer: {
				S: newCaptcha.text
			}
		}
	};
	await dynamodb.putItem(body).promise();

	// Return the captcha
	return {
		statusCode: 200,
		headers: {
			'Set-Cookie': `captcha=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${captchaTtl}`,
			'Content-Type': 'image/svg+xml',
			'Content-Length': Buffer.byteLength(newCaptcha.data, 'utf-8')
		},
		body: newCaptcha.data
	};
}

interface RegisterApiResponse {
	success: boolean;
	errors: string[];
	message?: string;
}

function validateBodyIsJson(body: string | undefined): true | APIGatewayProxyResultV2 {
	const errorBody: RegisterApiResponse = {
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

async function registerPhase1(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
	// Validate the body
	const bodyValidResponse = validateBodyIsJson(event.body);
	if (bodyValidResponse !== true) {
		return bodyValidResponse;
	}

	// Parse the body
	const body = JSON.parse(event.body as string);
	const response: RegisterApiResponse = {
		success: true,
		errors: []
	};

	// Validate the body parameters
	if (!body.phone || !phoneRegex.test(body.phone)) {
		response.success = false;
		response.errors.push('phone');
	}
	if (!body.name) {
		response.success = false;
		response.errors.push('name');
	}

	// Get the cookies for the request
	const cookies: { [key: string]: string } = (event.headers.Cookie || '')
		.split('&')
		.map((str) => str.split('='))
		.reduce((acc, arr) => ({
			...acc,
			[arr[0]]: arr[1] || ''
		}), {});

	// Verify the captcha
	if (!cookies.captcha) {
		response.success = false;
		response.errors.push('captcha');
	} else {
		const captcha = await dynamodb.getItem({
			TableName: captchaTable,
			Key: {
				CaptchaId: {
					S: cookies.captcha
				}
			}
		}).promise();

		if (!captcha.Item) {
			response.success = false;
			response.errors.push('captcha');
		} else {
			const expiry = parseInt(captcha.Item.ExpTime.N as string) * 1000;
			const answer = captcha.Item.Answer.S;

			if (expiry <= Date.now() || answer !== body.captcha) {
				response.success = false;
				response.errors.push('captcha');

				await dynamodb.deleteItem({
					TableName: captchaTable,
					Key: {
						CaptchaId: {
							S: cookies.captcha
						}
					}
				}).promise();
			}
		}
	}

	// Create an event to send a verification text and insert the user into the table
	if (response.success) {
		const event = {
			action: 'register',
			phone: body.phone,
			name: body.name
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

async function registerPhase2(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
	// Validate the body
	const bodyValidResponse = validateBodyIsJson(event.body);
	if (bodyValidResponse !== true) {
		return bodyValidResponse;
	}

	// Parse the body
	const body = JSON.parse(event.body as string);
	const response: RegisterApiResponse = {
		success: true,
		errors: []
	};

	// Validate the body parameters
	if (!body.phone || !phoneRegex.test(body.phone)) {
		response.success = false;
		response.errors.push('phone');
	}
	if (!body.code) {
		response.success = false;
		response.errors.push('code');
	}

	// Validate the code (if available)
	if (response.success) {
		const code = await dynamodb.getItem({
			TableName: phoneTable,
			Key: {
				phone: {
					N: body.phone.replace(/[^0-9]/g, '')
				}
			}
		}).promise();

		if (!code.Item) {
			response.success = false;
			response.errors.push('code');
		} else {
			const expiry = parseInt(code.Item.codeExpiry.N as string);
			const answer = code.Item.code.N?.padStart(6, '0');

			response.success = expiry >= Date.now() && body.code === answer;
			if (!response.success) {
				response.errors.push('code');
			}
		}
	}

	if (response.success) {
		response.message = 'Subscribed!';
		const event = {
			action: 'activate',
			phone: body.phone
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

async function handleMessage(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
	await sqs.sendMessage({
		MessageBody: JSON.stringify({
			action: 'twilio',
			sig: event.headers['X-Twilio-Signature'],
			body: event.body
		}),
		QueueUrl: queueUrl
	}).promise();

	return {
		statusCode: 200,
		headers: {
			'Content-Type': 'application/xml'
		},
		body: '<Response></Response>'
	};
}

async function handlePage(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
	// Validate the body
	const bodyValidResponse = validateBodyIsJson(event.body);
	if (bodyValidResponse !== true) {
		return bodyValidResponse;
	}

	// Parse the body
	const body = JSON.parse(event.body as string);
	const response: RegisterApiResponse = {
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
		})));
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
			case 'captcha':
				return createCaptcha();
			case 'register1':
				return registerPhase1(event);
			case 'register2':
				return registerPhase2(event);
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
