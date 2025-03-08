import * as AWS from 'aws-sdk';
import * as lambda from 'aws-lambda';
const twilio = require('twilio');

const dynamodb = new AWS.DynamoDB();
const secretManager = new AWS.SecretsManager();

const phoneTable = process.env.TABLE_PHONE as string;
const trafficTable = process.env.TABLE_TRAFFIC as string;
const apiCode = process.env.SERVER_CODE as string;

const welcomeMessage = `Welcome to the Crestone Volunteer Fire Department text group!

This number will be used to communicate with other members of the department and receive recordings of pages sent from dispatch over the radio.

To send a message to the group, just reply to this number.

In a moment, you will receive a copy of the last page sent out over VHF.

You can leave this group at any time by texting "STOP" to this number.`;
const codeTtl = 1000 * 60 * 5; // 5 minutes

interface TwilioConfig {
	accountSid: string;
	authToken: string;
	fromNumber: string;
	pageNumber: string;
}

const twilioSecretId = process.env.TWILIO_SECRET as string;
const twilioSecretPromise: Promise<TwilioConfig> = secretManager.getSecretValue({
	SecretId: twilioSecretId
}).promise()
	.then((data) => JSON.parse(data.SecretString as string))
	.catch((e) => {
		console.error(e);
		return null;
	});

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

async function getRecipients() {
	return dynamodb.scan({
		TableName: phoneTable,
		FilterExpression: '#a = :a',
		ExpressionAttributeNames: {
			'#a': 'isActive'
		},
		ExpressionAttributeValues: {
			':a': {
				BOOL: true
			}
		}
	}).promise()
		.then((data) => data.Items || []);
}

async function sendMessage(
	phone: string | undefined,
	body: string,
	mediaUrl: string[] = [],
	isPage: boolean = false
) {
	if (typeof phone === 'undefined') {
		return;
	}

	const twilioConf = await twilioSecretPromise;
	if (twilioConf === null) {
		throw new Error('Cannot get twilio secret');
	}

	const messageConfig = {
		body,
		mediaUrl,
		from: isPage ? twilioConf.pageNumber : twilioConf.fromNumber,
		to: `+1${parsePhone(phone)}`
	};

	return twilio(twilioConf.accountSid, twilioConf.authToken)
		.messages.create(messageConfig);
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

function createPageMessage(fileKey: string): string {
	const queryParam = fileKey.split('/')[1];

	return `Saguache Sheriff: PAGE - https://fire.klawil.net/?f=${queryParam}`;
}

interface ActivateOrLoginBody {
	action: 'activate' | 'login';
	phone: string;
}

async function handleActivation(body: ActivateOrLoginBody) {
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
	promises.push(sendMessage(body.phone, welcomeMessage));

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
				item.phone.N,
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
		.then((data) => sendMessage(
			body.phone,
			createPageMessage(data.Items && data.Items[0].Key.S || ''),
			[],
			true
		)));

	return Promise.all(promises);
}

interface TwilioBody {
	action: 'twilio';
	sig: string;
	body: string;
}

interface TwilioParams {
	From: string;
	To: string;
	Body: string;
	MediaUrl0?: string;
}

async function handleTwilio(body: TwilioBody) {
	// Pull out the information needed to validate the Twilio request
	const eventData = body.body
		?.split('&')
		.map((str) => str.split('=').map((str) => decodeURIComponent(str)))
		.reduce((acc, curr) => ({
			...acc,
			[curr[0]]: curr[1] || ''
		}), {}) as TwilioParams;
	eventData.Body = eventData.Body.replace(/\+/g, ' ');
	
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
		throw new Error(`Invalid sender`);
	}
	if (!sender.Item.isActive.BOOL) {
		throw new Error(`Invactive sender`);
	}

	// Get the number that was messaged
	const messageTo = eventData.To;
	const twilioConf = await twilioSecretPromise;

	const recipients = await getRecipients()
		.then((data) => data.filter((number) =>
			messageTo === twilioConf.pageNumber ||
			number.phone.N !== sender.Item?.phone.N));

	// Build the message
	const messageBody = `${sender.Item.name.S}: ${eventData.Body}`;
	const mediaUrls: string[] = Object.keys(eventData)
		.filter((key) => key.indexOf('MediaUrl') === 0)
		.map((key) => eventData[key as keyof TwilioParams] as string);

	await Promise.all(recipients
		.map((number) =>  sendMessage(number.phone.N, messageBody, mediaUrls)) || []);
}

interface PageBody {
	action: 'page';
	key: string;
}

async function handlePage(body: PageBody) {
	// Build the message body
	const messageBody = createPageMessage(body.key);
	const recipients = await getRecipients();

	// Send the messages
	await Promise.all(recipients
		.map((phone) => sendMessage(
			phone.phone.N,
			messageBody,
			[],
			true
		)));
}

async function handleLogin(body: ActivateOrLoginBody) {
	const code = randomString(6, true);
	const codeTimeout = Date.now() + codeTtl;

	await dynamodb.updateItem({
		TableName: phoneTable,
		Key: {
			phone: {
				N: body.phone
			}
		},
		ExpressionAttributeNames: {
			'#c': 'code',
			'#ce': 'codeExpiry'
		},
		ExpressionAttributeValues: {
			':c': {
				S: code
			},
			':ce': {
				N: `${codeTimeout}`
			}
		},
		UpdateExpression: 'SET #c = :c, #ce = :ce'
	}).promise();

	await sendMessage(body.phone, `Your login code is ${code}. This code expires in 5 minutes.`);
}

async function parseRecord(event: lambda.SQSRecord) {
	const body = JSON.parse(event.body);
	try {
		console.log(`QUEUE - CALL - ${body.action || 'invalid'}`);
		let response;
		switch (body.action) {
			case 'activate':
				response = await handleActivation(body);
				break;
			case 'twilio':
				response = await handleTwilio(body);
				break;
			case 'page':
				response = await handlePage(body);
				break;
			case 'login':
				response = await handleLogin(body);
				break;
			default:
				console.log(`QUEUE - 404`);
		}
		return response;
	} catch (e) {
		console.log(`QUEUE - ERROR - ${body.action || 'invalid'}`);
		console.error(e);
		throw e;
	}
}

export async function main(event: lambda.SQSEvent) {
	await Promise.all(event.Records.map(parseRecord));
}
