import * as AWS from 'aws-sdk';
import * as lambda from 'aws-lambda';
import * as https from 'https';
import { getPageNumber, getRecipients, getTwilioSecret, incrementMetric, parsePhone, saveMessageData, sendMessage, twilioPhoneNumbers } from './utils/general';
import { PagingTalkgroup, defaultDepartment, departmentConfig, pagingConfig, validDepartments } from '../../common/userConstants';
import { fNameToDate } from '../../common/file';
import { ActivateBody, LoginBody, PageBody, TranscribeBody, TwilioBody, TwilioErrorBody } from './types/queue';
import { getLogger } from './utils/logger';

const logger = getLogger('queue');
const dynamodb = new AWS.DynamoDB();
const transcribe = new AWS.TranscribeService();
const cloudWatch = new AWS.CloudWatch();

const phoneTable = process.env.TABLE_USER as string;
const dtrTable = process.env.TABLE_DTR as string;
const dtrTranslationTable = process.env.TABLE_DTR_TRANSLATION as string;

const metricSource = 'Queue';

const welcomeMessageParts: {
	welcome: string;
	textGroup: string;
	pageGroup: string;
	howToLeave: string;
} = {
	welcome: `Welcome to the {{name}} {{type}} group!`,
	textGroup: `This number will be used to send and receive messages from other members of the department.\n\nIn a moment, you will receive a text from another number with a link to a sample page you would have received. That number will only ever send you pages or important announcements.\n\nTo send a message to other members of your department, just send a text to this number. Any message you send will show up for others with your name and callsign attached.`,
	pageGroup: `This number will be used to send pages and only pages.\n\nIn a moment, you will receive a text with a link to a sample page you would have received.`,
	howToLeave: `You can leave this group at any time by texting "STOP" to this number.`
};

type WelcomeMessageConfigKeys = 'name' | 'type';

const codeTtl = 1000 * 60 * 5; // 5 minutes

const timeZone = 'America/Denver';

function dateToTimeString(d: Date): string {
	logger.trace('dateToTimeString', ...arguments);
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
	logger.trace('randomString', ...arguments);
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
	pageTg: PagingTalkgroup,
	number: string | null = null,
	transcript: string | null = null
): string {
	logger.trace('createPageMessage', ...arguments);
	const pageConfig = pagingConfig[pageTg];

	if (typeof pageConfig === 'undefined')
		return `Invalid paging talkgroup - ${pageTg} - ${fileKey}`;

	let pageStr = `${pageConfig.pageService} PAGE\n`;
	pageStr += `${pageConfig.partyBeingPaged} paged `
	pageStr += `${dateToTimeString(fNameToDate(fileKey))}\n`;
	if (transcript !== null) {
		pageStr += `\n${transcript}\n\n`;
	}
	pageStr += `https://fire.klawil.net/?f=${fileKey}&tg=${pageConfig.linkPreset}`;
	if (number !== null) {
		pageStr += `&cs=${number}`;
	}
	return pageStr;
}

async function handleActivation(body: ActivateBody) {
	logger.trace('handleActivation', ...arguments);
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
			'#dep': body.department,
			'#a': 'active',
			'#c': 'code',
			'#ce': 'codeExpiry'
		},
		ExpressionAttributeValues: {
			':a': {
				BOOL: true
			}
		},
		UpdateExpression: 'SET #dep.#a = :a REMOVE #c, #ce',
		ReturnValues: 'ALL_NEW'
	}).promise();

	// Send the welcome message
	const pageTgs = (updateResult.Attributes?.talkgroups?.NS || [])
		.map(key => Number(key))
		.map(key => pagingConfig[key as PagingTalkgroup]?.partyBeingPaged || `Talkgroup ${key}`)
		.join(', ')
	const config = departmentConfig[body.department] || departmentConfig[defaultDepartment];
	if (typeof config === 'undefined')
		return;
	const groupType = config.type === 'page'
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
		metricSource,
		'account',
		null,
		body.phone,
		config[`${groupType}Phone`] || config.pagePhone,
		customWelcomeMessage,
		[]
	));

	// Send the message to the admins
	promises.push(dynamodb.scan({
		TableName: phoneTable,
		ExpressionAttributeNames: {
			'#admin': 'admin',
			'#dep': body.department,
			'#da': 'isDistrictAdmin'
		},
		ExpressionAttributeValues: {
			':a': { BOOL: true },
		},
		FilterExpression: '#dep.#admin = :a OR #da = :a'
	}).promise()
		.then((admins) => {
			const adminsToSendTo = (admins.Items || [])
				.filter(item => typeof item.phone.N !== 'undefined');
			if (adminsToSendTo.length === 0) return;

			const adminMessageId = Date.now().toString();
			const adminMessageBody = `New subscriber: ${updateResult.Attributes?.fName.S} ${updateResult.Attributes?.lName.S} (${parsePhone(updateResult.Attributes?.phone.N as string, true)}) has been added to the ${body.department} group`;
			return Promise.all([
				saveMessageData(
					'departmentAlert',
					adminMessageId,
					adminsToSendTo.length,
					adminMessageBody,
					[],
					null,
					null,
					body.department
				),
				...adminsToSendTo.map((item) => sendMessage(
					metricSource,
					'departmentAlert',
					adminMessageId,
					item.phone.N as string,
					groupType === 'page' ? getPageNumber(item) : (config.textPhone || config.pagePhone),
					adminMessageBody
				)),
			]);
		}));

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
			const pageTg = Number(data.Items[0].Talkgroup.N || '8332') as PagingTalkgroup;

			return sendMessage(
				metricSource,
				'account',
				null,
				body.phone,
				config.pagePhone,
				createPageMessage(pageKey, pageTg),
				[]
			)
		}));

	return Promise.all(promises);
}

interface TwilioParams {
	From: string;
	To: string;
	Body: string;
	MediaUrl0?: string;
}

async function handleTwilio(body: TwilioBody) {
	logger.trace('handleTwilio', ...arguments);
	// Pull out the information needed to validate the Twilio request
	const eventData = body.body
		?.split('&')
		.map((str) => str.split('=').map((str) => decodeURIComponent(str)))
		.reduce((acc, curr) => ({
			...acc,
			[curr[0]]: curr[1] || ''
		}), {}) as TwilioParams;
	eventData.Body = eventData.Body.replace(/\+/g, ' ');

	// Get the configuration for the number the text was sent to
	if (typeof twilioPhoneNumbers[eventData.To] === 'undefined') {
		throw new Error(`Message to unkown Twilio number - ${eventData.To}`);
	}
	const phoneNumberConfig = twilioPhoneNumbers[eventData.To];
	if (typeof phoneNumberConfig.department === 'undefined') {
		throw new Error(`Message to Twilio number without assigned department - ${eventData.To}`);
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
		throw new Error(`Invalid sender`);
	}
	if (
		typeof phoneNumberConfig.department !== 'undefined' &&
		!sender.Item[phoneNumberConfig.department].M?.active?.BOOL
	) {
		throw new Error(`Invactive sender (${phoneNumberConfig.department})`);
	}
	if (
		typeof phoneNumberConfig.department === 'undefined' &&
		!validDepartments.reduce((active, dep) => active ||
			!sender.Item ||
			!!sender.Item[dep]?.M?.active?.BOOL, false)
	) {
		throw new Error(`Invactive sender (global)`);
	}

	// Get the number that was messaged
	const depConf = departmentConfig[phoneNumberConfig.department] || departmentConfig[defaultDepartment];
	if (typeof depConf === 'undefined')
		throw new Error('Invalid department');
	const adminSender = !!sender.Item[phoneNumberConfig.department]?.M?.admin?.BOOL;
	const isTest = !!sender.Item?.isTest?.BOOL;
	const twilioConf = await getTwilioSecret();
	const isFromPageNumber = adminSender && phoneNumberConfig.type === 'page';

	const recipients = await getRecipients(phoneNumberConfig.department, null, isTest)
		.then((data) => data.filter((number) => {
			if (isTest) return true;

			return isFromPageNumber ||
				number.phone.N !== sender.Item?.phone.N
		}));

	// Build the message
	const sendingUserInfo = `${sender.Item.fName.S} ${sender.Item.lName.S} (${sender.Item[phoneNumberConfig.department]?.M?.callSign?.S || 'N/A'})`;
	const messageBody = `${isFromPageNumber ? `${phoneNumberConfig.department} Announcement` : sendingUserInfo}: ${eventData.Body}${isFromPageNumber ? ` - ${sendingUserInfo}` : ''}`;
	const mediaUrls: string[] = Object.keys(eventData)
		.filter((key) => key.indexOf('MediaUrl') === 0)
		.map((key) => eventData[key as keyof TwilioParams] as string);

	const messageId = Date.now().toString();
	const insertMessage = saveMessageData(
		isFromPageNumber ? 'departmentAnnounce' : 'department',
		messageId,
		recipients.length,
		messageBody,
		mediaUrls,
		null,
		null,
		phoneNumberConfig.department,
		isTest
	);

	await Promise.all(recipients
		.filter(number => typeof number.phone.N !== 'undefined')
		.map((number) =>  sendMessage(
			metricSource,
			isFromPageNumber ? 'departmentAnnounce' : 'department',
			messageId,
			number.phone.N as string,
			depConf[`${isFromPageNumber ? 'page' : 'text'}Phone`] || depConf.pagePhone,
			messageBody,
			mediaUrls
				.map(s => s.replace(/https:\/\//, `https://${twilioConf.accountSid}:${twilioConf.authToken}@`))
		)) || []);

	await insertMessage;
}

async function handleTwilioError(body: TwilioErrorBody) {
	logger.trace('handleTwilioError', ...arguments);
	const recipients = (await getRecipients('all', null))
		.filter(user => {
			for (let i = 0; i < body.department.length; i++) {
				const dep = body.department[i];
				if (user[dep]?.M?.admin?.BOOL && user[dep]?.M?.active?.BOOL) {
					return true;
				}
			}

			return false;
		});
	const message = `Possible issue with ${body.name} phone (number is ${body.number})\n\nLast ${body.count} messages have not been delivered.`;

	let messageId = Date.now().toString();
	const insertMessage = saveMessageData(
		'departmentAlert',
		messageId,
		recipients.length,
		message,
		[],
		null,
		null,
	);
	await Promise.all(recipients.map(user => sendMessage(
		metricSource,
		'departmentAlert',
		messageId,
		user.phone.N as string,
		getPageNumber(user),
		message,
		[]
	)));
	await insertMessage;
}

async function handlePage(body: PageBody) {
	logger.trace('handlePage', ...arguments);
	// Build the message body
	const pageInitTime = new Date();
	const messageBody = createPageMessage(body.key, body.tg);
	const recipients = await getRecipients('all', body.tg, !!body.isTest);

	body.len = body.len || 0;

	let metricPromise: Promise<any> = new Promise(res => res(null));
	const pageTime = fNameToDate(body.key);
	const lenMs = body.len * 1000;
	if (body.isTest) {
		logger.info('handlePage', [
			{
				MetricName: 'PageDuration',
				Timestamp: pageTime,
				Unit: 'Milliseconds',
				Value: lenMs
			},
			{
				MetricName: 'PageToQueue',
				Timestamp: pageTime,
				Unit: 'Milliseconds',
				Value: pageInitTime.getTime() - pageTime.getTime() - lenMs
			}
		]);
	} else {
		metricPromise = cloudWatch.putMetricData({
			Namespace: 'Twilio Health',
			MetricData: [
				{
					MetricName: 'PageDuration',
					Timestamp: pageTime,
					Unit: 'Milliseconds',
					Value: lenMs
				},
				{
					MetricName: 'PageToQueue',
					Timestamp: pageTime,
					Unit: 'Milliseconds',
					Value: pageInitTime.getTime() - pageTime.getTime() - lenMs
				}
			]
		}).promise()
			.catch(e => {
				logger.error('handlePage', 'metrics', e);
			});
	}

	const messageId = Date.now().toString();
	const insertMessage = saveMessageData(
		'page',
		messageId,
		recipients.length,
		messageBody,
		[],
		body.key,
		body.tg,
		null,
		!!body.isTest
	);

	// Send the messages
	await Promise.all(recipients
		.filter(phone => typeof phone.phone.N !== 'undefined')
		.map(phone => sendMessage(
			metricSource,
			'page',
			messageId,
			phone.phone.N as string,
			getPageNumber(phone),
			createPageMessage(body.key, body.tg, phone.phone.N),
			[],
		)));

	await insertMessage;
	await metricPromise;
}

async function handleLogin(body: LoginBody) {
	logger.trace('handleLogin', ...arguments);
	const code = randomString(6, true);
	const codeTimeout = Date.now() + codeTtl;

	const updateResult = await dynamodb.updateItem({
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
		UpdateExpression: 'SET #c = :c, #ce = :ce',
		ReturnValues: 'ALL_NEW'
	}).promise();

	if (!updateResult.Attributes) {
		throw new Error(`Failed to add login code to user`);
	}

	await sendMessage(
		metricSource,
		'account',
		null,
		body.phone,
		getPageNumber(updateResult.Attributes),
		`This message was only sent to you. Your login code is ${code}. This code expires in 5 minutes.`,
		[]
	);
}

interface TranscribeResult {
	jobName: string;
	results: {
		transcripts: {
			transcript: string;
		}[];
		speaker_labels: {
			segments: {
				start_time: string;
				end_time: string;
				speaker_label: string;
			}[];
		},
		items: ({
			type: 'pronunciation';
			start_time: string;
			alternatives: {
				content: string;
			}[];
		} | {
			type: 'punctuation';
			alternatives: {
				content: string;
			}[];
		})[];
	};
};

async function getItemToUpdate(key: string | null): Promise<AWS.DynamoDB.AttributeMap | null> {
	logger.trace('getItemToUpdate', ...arguments);
	if (key === null) return key;

	let item: AWS.DynamoDB.AttributeMap | null = null;
	let count = 0;
	do {
		const result = await dynamodb.query({
			TableName: dtrTable,
			IndexName: 'KeyIndex',
			ExpressionAttributeNames: {
				'#k': 'Key',
			},
			ExpressionAttributeValues: {
				':k': { S: key },
			},
			KeyConditionExpression: '#k = :k',
		}).promise();

		if (!result.Items || result.Items.length === 0) {
			const resultMap = await dynamodb.getItem({
				TableName: dtrTranslationTable,
				Key: {
					Key: { S: key },
				}
			}).promise();

			key = resultMap.Item?.NewKey?.S || null;
		} else {
			item = result.Items[0];
		}
	} while (item === null && key !== null && count++ < 10);

	return item;
}

async function handleTranscribe(body: TranscribeBody) {
	logger.trace('handleTranscribe', ...arguments);
	// Check for the correct transcription job fomat
	if (!/^\d{4,5}\-\d+$/.test(body.detail.TranscriptionJobName)) {
		throw new Error(`Invalid transcription job name - ${body.detail.TranscriptionJobName}`);
	}

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

	const transcript: string = result.results.transcripts[0].transcript === ''
		? 'No voices detected'
		: result.results.transcripts[0].transcript;

	// Build the message
	let messageBody: string;
	let promise: Promise<any> = new Promise(res => res(null));
	let tg: PagingTalkgroup;
	const jobInfo: { [key: string]: string; } = (transcriptionInfo.TranscriptionJob?.Tags || []).reduce((agg: { [key: string]: string; }, value) => {
		agg[value.Key] = value.Value;
		return agg;
	}, {});
	if (jobInfo.Talkgroup) {
		tg = Number(jobInfo.Talkgroup) as PagingTalkgroup;
		messageBody = createPageMessage(
			jobInfo.File as string,
			tg,
			null,
			transcript
		);

		promise = getItemToUpdate(jobInfo.FileKey as string)
			.then(item => {
				if (item === null) return;

				return dynamodb.updateItem({
					TableName: dtrTable,
					Key: {
						Talkgroup: { N: item.Talkgroup.N },
						Added: { N: item.Added.N },
					},
					ExpressionAttributeNames: {
						'#t': 'Transcript',
					},
					ExpressionAttributeValues: {
						':t': { S: transcript },
					},
					UpdateExpression: 'SET #t = :t',
				}).promise();
			});
	} else {
		tg = Number(body.detail.TranscriptionJobName.split('-')[0]) as PagingTalkgroup;
		messageBody = `Transcript for ${pagingConfig[tg].partyBeingPaged} page:\n\n${transcript}\n\nCurrent radio traffic: https://fire.klawil.net/?tg=${pagingConfig[tg].linkPreset}`;
	}

	// Exit early if this is transcribing an emergency transmission
	if (jobInfo.IsPage === 'n') {
		await promise;
		return;
	}

	// Get recipients and send
	const recipients = (await getRecipients('all', tg))
		.filter(r => r.getTranscript?.BOOL);
	const messageId = Date.now().toString();
	const insertMessage = saveMessageData(
		'transcript',
		messageId,
		recipients.length,
		messageBody,
		[],
		jobInfo.File || null,
		tg
	);

	if (jobInfo.File) {
		await Promise.all(recipients
			.filter(phone => typeof phone.phone.N !== 'undefined')
			.map(phone => sendMessage(
				metricSource,
				'transcript',
				messageId,
				phone.phone.N as string,
				getPageNumber(phone),
				createPageMessage(
					jobInfo.File as string,
					tg,
					phone.phone.N,
					transcript
				),
				[]
			)));
	} else {
		await Promise.all(recipients
			.filter(number => typeof number.phone.N !== 'undefined')
			.map(number => sendMessage(
				metricSource,
				'transcript',
				messageId,
				number.phone.N as string,
				getPageNumber(number),
				messageBody,
				[]
			)));
	}
	await insertMessage;
	await promise;
}

async function parseRecord(event: lambda.SQSRecord) {
	logger.debug('parseRecord', ...arguments);
	const body = JSON.parse(event.body);
	if (typeof body.action === 'undefined' && typeof body['detail-type'] !== 'undefined') {
		body.action = 'transcribe';
	}
	try {
		let response;
		switch (body.action) {
			case 'activate':
				response = await handleActivation(body);
				break;
			case 'twilio':
				response = await handleTwilio(body);
				break;
			case 'twilio_error':
				response = await handleTwilioError(body);
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
					source: metricSource,
					type: '404'
				});
		}
		return response;
	} catch (e) {
		logger.error('parseRecord', e);
		await incrementMetric('Error', {
			source: metricSource,
			type: 'Thrown exception'
		});
	}
}

export async function main(event: lambda.SQSEvent) {
	logger.trace('main', ...arguments);
	await Promise.all(event.Records.map(parseRecord));
}
