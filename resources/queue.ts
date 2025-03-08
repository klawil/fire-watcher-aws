import * as AWS from 'aws-sdk';
import * as lambda from 'aws-lambda';
import * as https from 'https';
import { getRecipients, getTwilioSecret, incrementMetric, parsePhone, saveMessageData, sendMessage } from './utils/general';
import { PagingTalkgroup, UserDepartment, defaultDepartment, departmentConfig, pagingConfig } from '../common/userConstants';
import { fNameToDate } from '../common/file';
import { ActivateBody, LoginBody, PageBody, TranscribeBody, TwilioBody, TwilioErrorBody } from './types/queue';

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
	welcome: `Welcome to the {{name}} {{type}}!`,
	textGroup: `This number will be used to send and receive messages from other members of the Fire Department.\n\nIn a moment, you will receive a text from another number with a link to a sample page you would have received. That number will only ever send you pages or important announcements.\n\nTo send a message to other members of your department, just send a text to this number. Any message you send will show up for others with your name and callsign attached.`,
	pageGroup: `This number will be used to send pages and only pages.\n\nIn a moment, you will receive a text with a link to a sample page you would have received.`,
	howToLeave: `You can leave this group at any time by texting "STOP" to this number.`
};

type WelcomeMessageConfigKeys = 'name' | 'type';

const codeTtl = 1000 * 60 * 5; // 5 minutes

const timeZone = 'America/Denver';

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
	pageTg: PagingTalkgroup,
	callSign: string | null = null,
	transcript: string | null = null
): string {
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
	if (callSign !== null) {
		pageStr += `&cs=${callSign}`;
	}
	return pageStr;
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
	const pageTgs = (updateResult.Attributes?.talkgroups?.NS || [])
		.map(key => Number(key))
		.map(key => pagingConfig[key as PagingTalkgroup]?.partyBeingPaged || `Talkgroup ${key}`)
		.join(', ')
	const config = departmentConfig[updateResult.Attributes?.department?.S as UserDepartment] || departmentConfig[defaultDepartment];
	if (typeof config === 'undefined')
		return;
	const groupType = config.type === 'page' || updateResult.Attributes?.pageOnly?.BOOL
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
		null,
		body.phone,
		updateResult.Attributes?.department?.S as UserDepartment,
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
					metricSource,
					null,
					item.phone.N,
					item.department.S as UserDepartment,
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
			const pageTg = Number(data.Items[0].Talkgroup.N || '8332') as PagingTalkgroup;

			return sendMessage(
				metricSource,
				null,
				body.phone,
				updateResult.Attributes?.department?.S as UserDepartment,
				createPageMessage(pageKey, pageTg),
				[],
				true
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
	const depConf = departmentConfig[sender.Item?.department?.S as UserDepartment] || departmentConfig[defaultDepartment];
	if (typeof depConf === 'undefined')
		throw new Error('Invalid department');
	const messageTo = eventData.To;
	const adminSender = !!sender.Item?.isAdmin?.BOOL;
	const isTest = !!sender.Item?.isTest?.BOOL;
	const twilioConf = await getTwilioSecret();
	const pageNumber = depConf.pagingPhone;
	const isFromPageNumber = adminSender && messageTo === pageNumber;

	const recipients = await getRecipients(sender.Item?.department.S || '', null, isTest)
		.then((data) => data.filter((number) => {
			if (isTest) return true;

			return messageTo === pageNumber ||
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
			metricSource,
			messageId,
			number.phone.N,
			number.department.S as UserDepartment,
			messageBody,
			mediaUrls
				.map(s => s.replace(/https:\/\//, `https://${twilioConf.accountSid}:${twilioConf.authToken}@`)),
			isFromPageNumber
		)) || []);

	await insertMessage;
}

async function handleTwilioError(body: TwilioErrorBody) {
	const recipients = (await getRecipients('all', null))
		.filter(user => user.getSystemAlerts?.BOOL ||
			(
				user.department?.S === body.department &&
				user.isAdmin?.BOOL
			));
	const message = `Possible issue with ${body.name} phone (number is ${body.number})\n\nLast ${body.count} messages have not been delivered.`;

	let messageId = Date.now().toString();
	const insertMessage = saveMessageData(
		messageId,
		recipients.length,
		message,
		[],
		null,
		null,
		false
	);
	await Promise.all(recipients.map(user => sendMessage(
		metricSource,
		messageId,
		user.phone.N,
		user.department.S as UserDepartment,
		message,
		[],
		true
	)));
	await insertMessage;
}

async function handlePage(body: PageBody) {
	// Build the message body
	const pageInitTime = new Date();
	const messageBody = createPageMessage(body.key, body.tg);
	const recipients = await getRecipients('all', body.tg, !!body.isTest);

	body.len = body.len || 0;

	let metricPromise: Promise<any> = new Promise(res => res(null));
	const pageTime = fNameToDate(body.key);
	const lenMs = body.len * 1000;
	if (body.isTest) {
		console.log([
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

	// Send the messages
	await Promise.all(recipients
		.map((phone) => sendMessage(
			metricSource,
			messageId,
			phone.phone.N,
			phone.department.S as UserDepartment,
			createPageMessage(body.key, body.tg, phone.callSign.N),
			[],
			true
		)));

	await insertMessage;
	await metricPromise;
}

async function handleLogin(body: LoginBody) {
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

	await sendMessage(
		metricSource,
		null,
		body.phone,
		updateResult.Attributes?.department?.S as UserDepartment,
		`This message was only sent to you. Your login code is ${code}. This code expires in 5 minutes.`,
		[],
		true
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

	// Get recipients and send
	const recipients = (await getRecipients('all', tg))
		.filter(r => r.getTranscript?.BOOL);
	const messageId = Date.now().toString();
	const insertMessage = saveMessageData(
		messageId,
		recipients.length,
		messageBody
	);

	if (jobInfo.File) {
		await Promise.all(recipients.map(phone => sendMessage(
			metricSource,
			messageId,
			phone.phone.N,
			phone.department.S as UserDepartment,
			createPageMessage(
				jobInfo.File as string,
				tg,
				phone.callSign.N,
				transcript
			),
			[],
			true
		)));
	} else {
		await Promise.all(recipients.map(number => sendMessage(
			metricSource,
			messageId,
			number.phone.N,
			number.department?.S as UserDepartment,
			messageBody,
			[],
			true
		)));
	}
	await insertMessage;
	await promise;
}

async function parseRecord(event: lambda.SQSRecord) {
	const body = JSON.parse(event.body);
	if (typeof body.action === 'undefined' && typeof body['detail-type'] !== 'undefined') {
		body.action = 'transcribe';
	}
	console.log(JSON.stringify(body));
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
		console.error(e);
		await incrementMetric('Error', {
			source: metricSource,
			type: 'Thrown exception'
		});
		throw e;
	}
}

export async function main(event: lambda.SQSEvent) {
	await Promise.all(event.Records.map(parseRecord));
}
