import * as AWS from 'aws-sdk';
import * as lambda from 'aws-lambda';
import * as https from 'https';
import { getRecipients, getTwilioSecret, incrementMetric, parsePhone, saveMessageData, sendMessage } from './utils/general';

const dynamodb = new AWS.DynamoDB();
const transcribe = new AWS.TranscribeService();
const cloudWatch = new AWS.CloudWatch();

const phoneTable = process.env.TABLE_PHONE as string;
const dtrTable = process.env.TABLE_DTR as string;

const metricSource = 'Queue';

const welcomeMessageParts: {
	welcome: string;
	textGroup: string;
	pageGroup: string;
	howToLeave: string;
} = {
	welcome: `Welcome to the {{department}} {{type}}!`,
	textGroup: `This number will be used to send and receive messages from other members of the Fire Department.\n\nIn a moment, you will receive a text from another number with a link to a sample page you would have received. That number will only ever send you pages or important announcements.\n\nTo send a message to other members of your department, just send a text to this number. Any message you send will show up for others with your name and callsign attached.`,
	pageGroup: `This number will be used to send pages and only pages.\n\nIn a moment, you will receive a text with a link to a sample page you would have received.`,
	howToLeave: `You can leave this group at any time by texting "STOP" to this number.`
};

type WelcomeMessageConfigKeys = 'department' | 'type' | 'departmentShort';
const welcomeMessageConfig: { [key: string]: {
	department: string;
	type: string;
	departmentShort: string;
	isPageOnly: boolean;
} } = {
	Crestone: {
		department: 'Crestone Volunteer Fire Department',
		type: 'text group',
		departmentShort: 'NSCFPD',
		isPageOnly: false
	},
	Moffat: {
		department: 'Moffat Volunteer Fire Department',
		type: 'text group',
		departmentShort: 'NSCFPD',
		isPageOnly: false
	},
	Saguache: {
		department: 'Saguache Volunteer Fire Department',
		type: 'text group',
		departmentShort: 'NSCFPD',
		isPageOnly: false
	},
	'Villa Grove': {
		department: 'Villa Grove Volunteer Fire Department',
		type: 'text group',
		departmentShort: 'NSCFPD',
		isPageOnly: false
	},
	Baca: {
		department: 'Baca Emergency Services',
		type: 'backup paging system',
		departmentShort: 'Baca',
		isPageOnly: true
	},
	NSCAD: {
		department: 'Northern Saguache County Ambulance District',
		type: 'backup paging system',
		departmentShort: 'NSCAD',
		isPageOnly: true
	},
};

const tgToPageDept: { [key: string]: string } = {
	'8332': 'NSCFPD',
	'18331': 'Baca ES',
	'18332': 'NSCFPD',
	'8198': 'NSCAD',
	'8334': 'Center ES'
};

const pageConfigs: {
	[key: string]: {
		linkPreset: string;
		pagingParty: string;
		partyBeingPaged: string;
		pageService: string;
		fToTime: (fName: string) => Date;
	}
} = {
	'8198': {
		linkPreset: 'pNSCAD',
		pagingParty: 'Saguache SO',
		partyBeingPaged: 'NSCAD',
		pageService: 'AMBO',
		fToTime: dtrFnameToDate
	},
	'8332': {
		linkPreset: 'pNSCFPD',
		pagingParty: 'Saguache SO',
		partyBeingPaged: 'NSCFPD',
		pageService: 'FIRE',
		fToTime: dtrFnameToDate
	},
	'18331': {
		linkPreset: 'pBGFD%252FBGEMS',
		pagingParty: 'Alamosa',
		partyBeingPaged: 'BGEMS/BGFD',
		pageService: 'BACA',
		fToTime: vhfFnameToDate
	},
	'18332': {
		linkPreset: 'pNSCFPD',
		pagingParty: 'Saguache SO',
		partyBeingPaged: 'NSCFPD',
		pageService: 'FIRE',
		fToTime: vhfFnameToDate
	},
	'8334': {
		linkPreset: 'tg8334',
		pagingParty: 'Center Dispatch',
		partyBeingPaged: 'Center EMS/Fire',
		pageService: 'CENTER',
		fToTime: dtrFnameToDate
	},
};

const codeTtl = 1000 * 60 * 5; // 5 minutes

const timeZone = 'America/Denver';

function dtrFnameToDate(fileName: string): Date {
	let d = new Date(0);
	try {
		const parts = fileName.match(/\d{4}-(\d{10})_\d{9}-call_\d+\.m4a/);

		if (parts !== null) {
			d = new Date(parseInt(parts[1], 10) * 1000);
		}
	} catch (e) {}

	return d;
}

function vhfFnameToDate(fileName: string): Date {
	let d = new Date(0);
	try {
		const parts = fileName.match(/(SAG|BG)_FIRE_VHF_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})\.mp3/);

		if (parts !== null) {
			d = new Date(`${parts[2]}-${parts[3]}-${parts[4]}T${parts[5]}:${parts[6]}:${parts[7]}Z`);
		}
	} catch (e) {}
	
	return d;
}

function dateToTimeString(d: Date): string {
	const dateString = d.toLocaleDateString('en-US', {
		timeZone: timeZone,
		weekday: 'short',
		month: 'short',
		day: '2-digit'
	});
	
	const timeString = d.toLocaleTimeString('en-US', {
		timeZone: timeZone,
		hour12: false,
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit'
	});

	return `on ${dateString} at ${timeString}`;
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

function createPageMessage(
	fileKey: string,
	pageTg: string,
	callSign: string | null = null
): string {
	const pageConfig = pageConfigs[pageTg];

	if (typeof pageConfig === 'undefined')
		return `Invalid paging talkgroup - ${pageTg} - ${fileKey}`;

	let pageStr = `${pageConfig.pageService} PAGE\n`;
	pageStr += `${pageConfig.pagingParty} paged ${pageConfig.partyBeingPaged} `
	pageStr += `${dateToTimeString(pageConfig.fToTime(fileKey))}\n`;
	pageStr += `https://fire.klawil.net/?f=${fileKey}&tg=${pageConfig.linkPreset}`;
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
	const pageTgs = (updateResult.Attributes?.talkgroups?.NS || [])
		.map(key => tgToPageDept[key] || `Talkgroup ${key}`)
		.join(', ')
	const config = welcomeMessageConfig[updateResult.Attributes?.department?.S || 'Crestone'];
	const groupType = config.isPageOnly || updateResult.Attributes?.pageOnly?.BOOL
		? 'page'
		: 'text';
	const customWelcomeMessage = (
		`${welcomeMessageParts.welcome}\n\n` +
		`${welcomeMessageParts[`${groupType}Group`]}\n\n` +
		`You will receive pages for: ${pageTgs}\n\n` +
		`${welcomeMessageParts.howToLeave}`
	)
		.replace(/\{\{([^\}]+)\}\}/g, (a: string, b: WelcomeMessageConfigKeys) => config[b]);
	promises.push(sendMessage(
		null,
		body.phone,
		customWelcomeMessage,
		[],
		groupType === 'page'
	));

	// Send the message to the admins
	if (updateResult.Attributes?.department?.S !== 'Baca') {
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
	}

	// Send the sample page
	promises.push(dynamodb.query({
		TableName: dtrTable,
		IndexName: 'ToneIndex',
		ExpressionAttributeValues: {
			':ti': {
				S: 'y'
			},
			':tg': {
				N: (updateResult.Attributes?.talkgroups?.NS || [ '8332' ])[0]
			}
		},
		ExpressionAttributeNames: {
			'#ti': 'ToneIndex',
			'#tg': 'Talkgroup'
		},
		KeyConditionExpression: '#ti = :ti',
		FilterExpression: '#tg = :tg',
		ScanIndexForward: false
	}).promise()
		.then((data) => {
			if (!data.Items || data.Items.length === 0) return;
			const pageKey = data.Items[0].Key?.S?.split('/').pop() || 'none';
			const pageTg = data.Items[0].Talkgroup.N || '8332';

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
	if (sender.Item.pageOnly?.BOOL) {
		throw new Error(`Page only sender`);
	}
	if (sender.Item.department?.S === 'Baca') {
		throw new Error(`Baca sender`);
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
		null,
		isTest
	);

	await Promise.all(recipients
		.map((number) =>  sendMessage(
			messageId,
			number.phone.N,
			messageBody,
			mediaUrls
				.map(s => s.replace(/https:\/\//, `https://${twilioConf.accountSid}:${twilioConf.authToken}@`)),
			isFromPageNumber
		)) || []);

	await insertMessage;
}

interface PageBody {
	action: 'page';
	key: string;
	tg: string;
	isTest?: boolean;
}

async function handlePage(body: PageBody) {
	// Build the message body
	const pageInitTime = new Date();
	const messageBody = createPageMessage(body.key, body.tg);
	const recipients = await getRecipients('all', body.tg, !!body.isTest);

	let metricPromise: Promise<any> = new Promise(res => res(null));
	if (!body.isTest) {
		const pageConfig = pageConfigs[body.tg];
		const pageTime = pageConfig.fToTime(body.key);
		metricPromise = cloudWatch.putMetricData({
			Namespace: 'Twilio Health',
			MetricData: [
				{
					MetricName: 'PageToQueue',
					Timestamp: pageTime,
					Unit: 'Milliseconds',
					Value: pageInitTime.getTime() - pageTime.getTime()
				}
			]
		}).promise()
			.catch(e => {
				console.error('Error with metrics');
				console.error(e);
			});
	}

	const messageId = Date.now().toString();
	const insertMessage = saveMessageData(
		messageId,
		recipients.length,
		messageBody,
		[],
		body.key,
		body.tg,
		!!body.isTest
	);

	// if (recipients.map(r => r.phone.N).indexOf('***REMOVED***') === -1) {
	// 	recipients.push({
	// 		phone: {
	// 			N: '***REMOVED***'
	// 		},
	// 		callSign: {
	// 			N: '120'
	// 		}
	// 	});
	// }

	// Send the messages
	await Promise.all(recipients
		.map((phone) => sendMessage(
			messageId,
			phone.phone.N,
			createPageMessage(body.key, body.tg, phone.callSign.N),
			[],
			true
		)));

	await insertMessage;
	await metricPromise;
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

interface TranscribeBody {
	'detail-type': string;
	detail: {
		TranscriptionJobName: string;
		TranscriptionJobStatus: string;
	}
}

interface TranscribeResult {
	jobName: string;
	results: {
		transcripts: {
			transcript: string;
		}[]
	}
}

async function handleTranscribe(body: TranscribeBody) {
	// Get the transcription results
	const transcriptionInfo = await transcribe.getTranscriptionJob({
		TranscriptionJobName: body.detail.TranscriptionJobName
	}).promise();
	const fileData: string = await new Promise((res, rej) => https.get(transcriptionInfo.TranscriptionJob?.Transcript?.TranscriptFileUri as string, response => {
		let data = '';

		response.on('data', chunk => data += chunk);	
		response.on('end', () => res(data));
	}).on('error', e => rej(e)));
	const result: TranscribeResult = JSON.parse(fileData);

	// Build the message
	const tg = result.jobName.split('-')[0];
	const messageBody = `Transcript for ${pageConfigs[tg].partyBeingPaged} page:\n\n${result.results.transcripts[0].transcript}`;

	// Get recipients and send
	const recipients = (await getRecipients('all', tg))
		.filter(r => r.getTranscript?.BOOL);
	const messageId = Date.now().toString();
	const insertMessage = saveMessageData(
		messageId,
		recipients.length,
		messageBody
	);

	await Promise.all(recipients.map(number => sendMessage(
		messageId,
		number.phone.N,
		messageBody,
		[],
		true
	)));
	await insertMessage;
}

async function parseRecord(event: lambda.SQSRecord) {
	const body = JSON.parse(event.body);
	if (typeof body.action === 'undefined' && typeof body['detail-type'] !== 'undefined') {
		body.action = 'transcribe';
	}
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
			case 'transcribe':
				response = await handleTranscribe(body);
				break;
			default:
				await incrementMetric('Error', {
					source: metricSource
				});
		}
		return response;
	} catch (e) {
		console.error(e);
		await incrementMetric('Error', {
			source: metricSource
		});
		throw e;
	}
}

export async function main(event: lambda.SQSEvent) {
	await Promise.all(event.Records.map(parseRecord));
}
