import * as AWS from 'aws-sdk';
import * as lambda from 'aws-lambda';
const twilio = require('twilio');

const dynamodb = new AWS.DynamoDB();
const secretManager = new AWS.SecretsManager();

const phoneTable = process.env.TABLE_PHONE as string;
const trafficTable = process.env.TABLE_TRAFFIC as string;

const twilioSecretId = process.env.TWILIO_SECRET as string;
const twilioSecretPromise = secretManager.getSecretValue({
	SecretId: twilioSecretId
}).promise()
	.then((data) => JSON.parse(data.SecretString as string))
	.catch((e) => {
		console.error(e);
		return null;
	});

const codeTtl = 1000 * 60 * 5;

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

function parsePhone(num: string, toHuman: boolean = false): string {
	if (!toHuman) {
		return num.replace(/[^0-9]/g, '');
	}

	const matches = parsePhone(num)
		.match(/([0-9]{3})([0-9]{3})([0-9]{4})/) as string[];

	return matches
		.slice(1)
		.join('-');
}

async function sendMessage(phone: string, body: string, mediaUrl: string[] = []) {
	const twilioConf = await twilioSecretPromise;
	if (twilioConf === null) {
		throw new Error('Cannot get twilio secret');
	}

	return twilio(twilioConf.accountSid, twilioConf.authToken)
		.messages.create({
			body,
			mediaUrl,
			from: twilioConf.fromNumber as string,
			to: `+1${parsePhone(phone)}`
		});
}

function createPageMessage(fileInfo: AWS.DynamoDB.ItemResponse['Item']): string {
	const queryParam = fileInfo?.Key.S?.split('/')[1];

	return `TONE - https://fire.klawil.net/?f=${queryParam}`;
}

interface RegisterBody {
	action: 'register';
	phone: string;
	name: string;
	captcha: string;
}

async function handleRegister(body: RegisterBody) {
	const promises: Promise<any>[] = [];

	// Create the verification code
	const verificationCode = randomString(6, true);

	// Create the user in the table
	promises.push(dynamodb.updateItem({
		TableName: phoneTable,
		Key: {
			phone: {
				N: parsePhone(body.phone)
			}
		},
		ExpressionAttributeNames: {
			'#n': 'name',
			'#c': 'code',
			'#ce': 'codeExpiry'
		},
		ExpressionAttributeValues: {
			':n': {
				S: body.name
			},
			':c': {
				N: verificationCode
			},
			':ce': {
				N: (Date.now() + codeTtl).toString()
			}
		},
		UpdateExpression: 'SET #n = :n, #c = :c, #ce = :ce'
	}).promise());

	// Send the verification message
	promises.push(sendMessage(body.phone, `Your validation code for Crestone Fire Notifications is ${verificationCode}`));

	await Promise.all(promises);
}

interface ActivateBody {
	action: 'activate';
	phone: string;
}

async function handleActivation(body: ActivateBody) {
	const promises: Promise<any>[] = [];

	// Update the user to active in the table
	const updateResult = await dynamodb.updateItem({
		TableName: phoneTable,
		Key: {
			phone: {
				N: parsePhone(body.phone)
			}
		},
		ExpressionAttributeNames: {
			'#a': 'isActive',
			'#c': 'code',
			'#ce': 'codeExpiry'
		},
		ExpressionAttributeValues: {
			':a': {
				BOOL: true
			}
		},
		UpdateExpression: 'SET #a = :a REMOVE #c, #ce',
		ReturnValues: 'ALL_NEW'
	}).promise();

	// Send the welcome message
	promises.push(sendMessage(body.phone, 'Welcome to Crestone Fire Notifications! A sample page will be sent momentarily'));

	// Send the message to the admins
	promises.push(dynamodb.scan({
		TableName: phoneTable,
		ExpressionAttributeNames: {
			'#admin': 'isAdmin'
		},
		ExpressionAttributeValues: {
			':a': {
				BOOL: true
			}
		},
		FilterExpression: '#admin = :a'
	}).promise()
		.then((admins) => Promise.all((admins.Items || []).map((item) => {
			return sendMessage(
				item.phone.N as string,
				`New subscriber: ${updateResult.Attributes?.name.S} (${parsePhone(updateResult.Attributes?.phone.N as string, true)})`
			);
		}))));

	// Send the sample page
	promises.push(dynamodb.query({
		TableName: trafficTable,
		ExpressionAttributeValues: {
			':t': {
				S: 'y'
			}
		},
		KeyConditionExpression: 'ToneIndex = :t',
		IndexName: 'ToneIndex',
		Limit: 1,
		ScanIndexForward: false
	}).promise()
		.then((data) => sendMessage(body.phone, `S.O.: ${createPageMessage(data.Items && data.Items[0])}`)));

	return Promise.all(promises);
}

interface TwilioBody {
	action: 'twilio';
	sig: string;
	body: string;
}

interface TwilioParams {
	From: string;
	Body: string;
	MediaUrl0?: string;
}

async function handleTwilio(body: TwilioBody) {
	// Pull out the information needed to validate the Twilio request
	const requestUrl = 'https://fire.klawil.net/api?action=message';
	const authToken = (await twilioSecretPromise).authToken;
	const eventData = body.body
		?.split('&')
		.map((str) => str.split('=').map((str) => decodeURIComponent(str)))
		.reduce((acc, curr) => ({
			...acc,
			[curr[0]]: curr[1] || ''
		}), {}) as TwilioParams;
	eventData.Body = eventData.Body.replace(/\+/g, ' ');
	
	// Verify the message
	if (!twilio.validateRequest(
		authToken,
		body.sig,
		requestUrl,
		eventData
	)) {
		console.error('INVALID REQUEST - TWILIO FAILED');
		return;
	}
	
	// Validate the sender
	const sender = await dynamodb.getItem({
		TableName: phoneTable,
		Key: {
			phone: {
				N: eventData.From.slice(2)
			}
		}
	}).promise();
	if (!sender.Item) {
		console.error('INVALID REQUEST - SENDER INVALID');
		return;
	}
	if (!sender.Item.isActive.BOOL) {
		console.error('INVALID REQUEST - SENDER INACTIVE');
		return;
	}

	const recepients = await dynamodb.scan({
		TableName: phoneTable,
		FilterExpression: '#a = :a AND #p <> :p',
		ExpressionAttributeNames: {
			'#a': 'isActive',
			'#p': 'phone'
		},
		ExpressionAttributeValues: {
			':a': {
				BOOL: true
			},
			':p': {
				N: sender.Item.phone.N
			}
		}
	}).promise();

	// Build the message
	const messageBody = `${sender.Item.name.S}: ${eventData.Body}`;
	const mediaUrls: string[] = Object.keys(eventData)
		.filter((key) => key.indexOf('MediaUrl') === 0)
		.map((key) => eventData[key as keyof TwilioParams] as string);

	await Promise.all(recepients.Items
		?.map((number) =>  sendMessage(number.phone.N as string, messageBody, mediaUrls)) || []);
}

async function parseRecord(event: lambda.SQSRecord) {
	const body = JSON.parse(event.body);
	switch (body.action) {
		case 'register':
			return handleRegister(body);
		case 'activate':
			return handleActivation(body);
		case 'twilio':
			return handleTwilio(body);
	}
}

export async function main(event: lambda.SQSEvent) {
	await Promise.all(event.Records.map(parseRecord));
}
