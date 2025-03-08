import * as AWS from 'aws-sdk';
import * as lambda from 'aws-lambda';
import { getTwilioSecret, parsePhone, sendMessage } from './utils/general';

const dynamodb = new AWS.DynamoDB();

const phoneTable = process.env.TABLE_PHONE as string;
const trafficTable = process.env.TABLE_TRAFFIC as string;
const messagesTable = process.env.TABLE_MESSAGES as string;

const welcomeMessage = `Welcome to the Crestone Volunteer Fire Department text group!

This number will be used to communicate with other members of the department and receive recordings of pages sent from dispatch over the radio.

To send a message to the group, just reply to this number.

In a moment, you will receive a copy of the last page sent out over VHF.

You can leave this group at any time by texting "STOP" to this number.`;
const codeTtl = 1000 * 60 * 5; // 5 minutes

async function getRecipients(isTest: boolean = false) {
	const scanInput: AWS.DynamoDB.ScanInput = {
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
	};

	if (isTest) {
		scanInput.ExpressionAttributeNames = scanInput.ExpressionAttributeNames || {};
		scanInput.ExpressionAttributeValues = scanInput.ExpressionAttributeValues || {};

		scanInput.ExpressionAttributeNames['#t'] = 'isTest';
		scanInput.ExpressionAttributeValues[':t'] = {
			BOOL: true
		};
		scanInput.FilterExpression += ' AND #t = :t';
	}

	return dynamodb.scan(scanInput).promise()
		.then((data) => data.Items || []);
}

async function saveMessageData(
	messageId: string,
	recipients: number,
	body: string,
	mediaUrls: string[] = [],
	isTest: boolean = false
) {
	await dynamodb.updateItem({
		TableName: messagesTable,
		Key: {
			datetime: {
				N: messageId
			}
		},
		ExpressionAttributeNames: {
			'#r': 'recipients',
			'#b': 'body',
			'#m': 'mediaUrls',
			'#t': 'isTest',
			'#ts': 'isTestString'
		},
		ExpressionAttributeValues: {
			':r': {
				N: recipients.toString()
			},
			':b': {
				S: body
			},
			':m': {
				S: mediaUrls.join(',')
			},
			':t': {
				BOOL: isTest
			},
			':ts': {
				S: isTest ? 'y' : 'n'
			}
		},
		UpdateExpression: 'SET #r = :r, #b = :b, #m = :m, #t = :t, #ts = :ts'
	}).promise();
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

function convertFileDateTime(fileName: string): Date {
	let d = new Date(0);
	try {
		const parts = fileName.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/);

		if (parts !== null) {
			d = new Date(`${parts.slice(1, 4).join('-')}T${parts.slice(4, 7).join(':')}Z`);
		}
	} catch (e) {}

	return d;
}

function createPageMessage(fileKey: string): string {
	const queryParam = fileKey.split('/')[1];
	const d = convertFileDateTime(queryParam);

	const dateString = d.toLocaleDateString('en-US', {
		timeZone: 'America/Denver',
		weekday: 'short',
		month: 'short',
		day: '2-digit'
	});
	
	const timeString = d.toLocaleTimeString('en-US', {
		timeZone: 'America/Denver',
		hour12: false,
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	});

	return `Saguache Sheriff: PAGE on ${dateString} at ${timeString} - https://fire.klawil.net/?f=${queryParam}`;
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
	promises.push(sendMessage(null, body.phone, welcomeMessage));

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
				null,
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
			null,
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
	const adminSender = !!sender.Item?.isAdmin?.BOOL;
	const isTest = !!sender.Item?.isTest?.BOOL;
	const twilioConf = await getTwilioSecret();
	const isFromPageNumber = adminSender && messageTo === twilioConf.pageNumber;

	const recipients = await getRecipients()
		.then((data) => data.filter((number) => {
			if (isTest) {
				return number.phone.N === sender.Item?.phone.N;
			}

			return messageTo === twilioConf.pageNumber ||
				number.phone.N !== sender.Item?.phone.N
		}));

	// Build the message
	const messageBody = `${isFromPageNumber ? 'Announcement' : `${sender.Item.name.S} (${sender.Item.callSign.N})`}: ${eventData.Body}${isFromPageNumber ? ` - ${sender.Item.callSign.N}` : ''}`;
	const mediaUrls: string[] = Object.keys(eventData)
		.filter((key) => key.indexOf('MediaUrl') === 0)
		.map((key) => eventData[key as keyof TwilioParams] as string);

	const messageId = Date.now().toString();
	const insertMessage = saveMessageData(
		messageId,
		recipients.length,
		messageBody,
		mediaUrls,
		isTest
	);

	await Promise.all(recipients
		.map((number) =>  sendMessage(
			messageId,
			number.phone.N,
			messageBody,
			mediaUrls,
			isFromPageNumber
		)) || []);

	await insertMessage;
}

interface PageBody {
	action: 'page';
	key: string;
	isTest?: boolean;
}

async function handlePage(body: PageBody) {
	// Build the message body
	const messageBody = createPageMessage(body.key);
	const recipients = await getRecipients(!!body.isTest);

	const messageId = Date.now().toString();
	const insertMessage = saveMessageData(
		messageId,
		recipients.length,
		messageBody,
		[],
		!!body.isTest
	);

	// Send the messages
	await Promise.all(recipients
		.map((phone) => sendMessage(
			messageId,
			phone.phone.N,
			messageBody,
			[],
			true
		)));

	await insertMessage;
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

	await sendMessage(null, body.phone, `This message was only sent to you. Your login code is ${code}. This code expires in 5 minutes.`);
}

async function testSystem() {
	const recipients = await getRecipients()
		.then((r) => r.filter((i) => i.test?.BOOL));

	console.log(`QUEUE - TEST - ${recipients.length} recipients`);
	console.log(JSON.stringify(recipients));

	// Test the paging system
	await Promise.all(recipients
		.map((phone) => sendMessage(
			null,
			phone.phone.N,
			createPageMessage('testPage/testPage'),
			[],
			true
		)));

	// Test the regular messaging system
	await Promise.all(recipients
		.map((phone) => sendMessage(
			null,
			phone.phone.N,
			'System: Test message 👍'
		)));
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
			case 'test':
				response = await testSystem();
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
