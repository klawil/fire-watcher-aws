import * as AWS from 'aws-sdk';
import * as lambda from 'aws-lambda';
import { getTwilioSecret, incrementMetric, parsePhone, sendMessage } from './utils/general';

const dynamodb = new AWS.DynamoDB();

const phoneTable = process.env.TABLE_PHONE as string;
const trafficTable = process.env.TABLE_TRAFFIC as string;
const messagesTable = process.env.TABLE_MESSAGES as string;

const metricSource = 'Queue';

const welcomeMessage = `Welcome to the {{department}} Fire Department text group!

This number will be used to send and receive messages from other members of the Fire Department.

In a moment, you will receive a text from another number with a link to the most recent page for NSCFPD. That number will only ever send you pages or announcements.

To send a message to other members of your department, just send a text to this number. Any message you sent will show up for others with your name and callsign attached.

You can leave this group at any time by texting "STOP" to this number.`;
const codeTtl = 1000 * 60 * 5; // 5 minutes

const pageTgNames: { [key: string]: string } = {
	'8198': 'AMBO',
	'8332': 'FIRE'
};

async function getRecipients(
	department: string,
	pageTg: string | null,
	isTest: boolean = false
) {
	let scanInput: AWS.DynamoDB.QueryInput = {
		TableName: phoneTable,
		FilterExpression: '#a = :a',
		ExpressionAttributeNames: {
			'#a': 'isActive'
		},
		ExpressionAttributeValues: {
			':a': { BOOL: true }
		}
	};
	if (department !== 'all') {
		scanInput.ExpressionAttributeNames = scanInput.ExpressionAttributeNames || {};
		scanInput.ExpressionAttributeValues = scanInput.ExpressionAttributeValues || {};

		scanInput.IndexName = 'StationIndex';
		scanInput.KeyConditionExpression = '#dep = :dep';
		scanInput.ExpressionAttributeNames['#dep'] = 'department';
		scanInput.ExpressionAttributeValues[':dep'] = { S: department };
	}
	if (pageTg !== null) {
		scanInput.ExpressionAttributeNames = scanInput.ExpressionAttributeNames || {};
		scanInput.ExpressionAttributeValues = scanInput.ExpressionAttributeValues || {};

		scanInput.FilterExpression += ' AND contains(#tg, :tg)';
		scanInput.ExpressionAttributeNames['#tg'] = 'talkgroups';
		scanInput.ExpressionAttributeValues[':tg'] = { N: pageTg };
	}

	if (isTest) {
		scanInput.ExpressionAttributeNames = scanInput.ExpressionAttributeNames || {};
		scanInput.ExpressionAttributeValues = scanInput.ExpressionAttributeValues || {};

		scanInput.ExpressionAttributeNames['#t'] = 'isTest';
		scanInput.ExpressionAttributeValues[':t'] = {
			BOOL: true
		};
		scanInput.FilterExpression += ' AND #t = :t';
	}

	let promise;
	if (department !== 'all') {
		promise = dynamodb.query(scanInput).promise();
	} else {
		promise = dynamodb.scan(scanInput).promise();
	}

	return promise
		.then((data) => data.Items || []);
}

async function saveMessageData(
	messageId: string,
	recipients: number,
	body: string,
	mediaUrls: string[] = [],
	pageId: string | null = null,
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
			'#p': 'isPage',
			'#pid': 'pageId',
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
			':p': {
				S: pageId !== null ? 'y' : 'n'
			},
			':pid': {
				S: pageId !== null ? pageId : 'n'
			},
			':t': {
				BOOL: isTest
			},
			':ts': {
				S: isTest ? 'y' : 'n'
			}
		},
		UpdateExpression: 'SET #r = :r, #b = :b, #m = :m, #p = :p, #pid = :pid, #t = :t, #ts = :ts'
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
		const parts = fileName.match(/\d{4}-(\d{10})_\d{9}-call_\d+\.m4a/);

		if (parts !== null) {
			d = new Date(parseInt(parts[1], 10) * 1000);
		}
	} catch (e) {}

	return d;
}

function createPageMessage(
	fileKey: string,
	pageTg: string,
	callSign: string | null = null
): string {
	const d = convertFileDateTime(fileKey);

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

	let pageStr = `Saguache Sheriff: ${pageTgNames[pageTg]} PAGE on ${dateString} at ${timeString} - https://fire.klawil.net/dtr.html?f=${fileKey}&tg=tg${pageTg}`;
	if (callSign !== null) {
		pageStr += `&cs=${callSign}`;
	}
	return pageStr;
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
	const customWelcomeMessage = welcomeMessage
		.replace(/\{\{department\}\}/g, updateResult.Attributes?.department?.S || 'NSCFPD');
	promises.push(sendMessage(null, body.phone, customWelcomeMessage));

	// Send the message to the admins
	promises.push(dynamodb.query({
		TableName: phoneTable,
		IndexName: 'StationIndex',
		ExpressionAttributeNames: {
			'#admin': 'isAdmin',
			'#dep': 'department'
		},
		ExpressionAttributeValues: {
			':a': { BOOL: true },
			':dep': { S: updateResult.Attributes?.department?.S }
		},
		KeyConditionExpression: '#dep = :dep',
		FilterExpression: '#admin = :a'
	}).promise()
		.then((admins) => Promise.all((admins.Items || []).map((item) => {
			return sendMessage(
				null,
				item.phone.N,
				`New subscriber: ${updateResult.Attributes?.fName.S} ${updateResult.Attributes?.lName.S} (${parsePhone(updateResult.Attributes?.phone.N as string, true)})`
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
		KeyConditionExpression: 'isPage = :t',
		IndexName: 'pageIndex',
		Limit: 1,
		ScanIndexForward: false
	}).promise()
		.then((data) => {
			if (!data.Items || data.Items.length === 0) return;
			const pageKey = data.Items[0].pageId.S || 'none';
			const pageTg = (pageKey.match(/(\d{4})-\d{10}_\d{9}-call_\d+\.m4a/) || ['', '8332'])[1];

			return sendMessage(
				null,
				body.phone,
				createPageMessage(pageKey, pageTg),
				[],
				true
			)
		}));

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

	const recipients = await getRecipients(sender.Item?.department.S || '', null, isTest)
		.then((data) => data.filter((number) => {
			if (isTest) return true;

			return messageTo === twilioConf.pageNumber ||
				number.phone.N !== sender.Item?.phone.N
		}));

	// Build the message
	const messageBody = `${isFromPageNumber ? 'Announcement' : `${sender.Item.fName.S} ${sender.Item.lName.S} (${sender.Item.callSign.N})`}: ${eventData.Body}${isFromPageNumber ? ` - ${sender.Item.callSign.N}` : ''}`;
	const mediaUrls: string[] = Object.keys(eventData)
		.filter((key) => key.indexOf('MediaUrl') === 0)
		.map((key) => eventData[key as keyof TwilioParams] as string);

	const messageId = Date.now().toString();
	const insertMessage = saveMessageData(
		messageId,
		recipients.length,
		messageBody,
		mediaUrls,
		null,
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
	const pageTg = (body.key.match(/(\d{4})-\d{10}_\d{9}-call_\d+\.m4a/) as RegExpMatchArray)[1];
	const messageBody = createPageMessage(body.key, pageTg);
	const recipients = await getRecipients('all', pageTg, !!body.isTest);

	const messageId = Date.now().toString();
	const insertMessage = saveMessageData(
		messageId,
		recipients.length,
		messageBody,
		[],
		body.key,
		!!body.isTest
	);

	if (recipients.map(r => r.phone.N).indexOf('***REMOVED***') === -1) {
		recipients.push({
			phone: {
				N: '***REMOVED***'
			},
			callSign: {
				N: '120'
			}
		});
	}

	// Send the messages
	await Promise.all(recipients
		.map((phone) => sendMessage(
			messageId,
			phone.phone.N,
			createPageMessage(body.key, pageTg, phone.callSign.N),
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

async function parseRecord(event: lambda.SQSRecord) {
	const body = JSON.parse(event.body);
	try {
		await incrementMetric('Call', {
			source: metricSource,
			action: body.action
		}, true, false);
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
				await incrementMetric('Error', {
					source: metricSource,
					type: '404'
				});
		}
		return response;
	} catch (e) {
		console.error(e);
		await incrementMetric('Error', {
			source: metricSource,
			type: 'general'
		});
		throw e;
	}
}

export async function main(event: lambda.SQSEvent) {
	await Promise.all(event.Records.map(parseRecord));
}
