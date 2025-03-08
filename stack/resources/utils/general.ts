import * as aws from 'aws-sdk';
import { UserDepartment, validDepartments } from '../../../common/userConstants';
import { getLogger } from './logger';

const logger = getLogger('u-gen');
const twilio = require('twilio');

const messagesTable = process.env.TABLE_MESSAGES as string;
const phoneTable = process.env.TABLE_USER as string;

const secretManager = new aws.SecretsManager();
const cloudWatch = new aws.CloudWatch();
const dynamodb = new aws.DynamoDB();

export function parsePhone(num: string, toHuman: boolean = false): string {
	logger.trace('parsePhone', ...arguments);
	if (!toHuman) {
		return num.replace(/[^0-9]/g, '');
	}

	const matches = parsePhone(num)
		.match(/([0-9]{3})([0-9]{3})([0-9]{4})/) as string[];

	return matches
		.slice(1)
		.join('-');
}

export async function getRecipients(
	department: string,
	pageTg: number | null,
	isTest: boolean = false
) {
	logger.trace('getRecipients', ...arguments);
	let scanInput: AWS.DynamoDB.QueryInput = {
		TableName: phoneTable,
	};
	if (pageTg !== null) {
		scanInput.ExpressionAttributeNames = scanInput.ExpressionAttributeNames || {};
		scanInput.ExpressionAttributeValues = scanInput.ExpressionAttributeValues || {};
		scanInput.FilterExpression = scanInput.FilterExpression || '';

		scanInput.FilterExpression = 'contains(#tg, :tg)';
		scanInput.ExpressionAttributeNames['#tg'] = 'talkgroups';
		scanInput.ExpressionAttributeValues[':tg'] = { N: pageTg.toString() };
	}
	if (department !== 'all') {
		scanInput.ExpressionAttributeNames = scanInput.ExpressionAttributeNames || {};
		scanInput.ExpressionAttributeValues = scanInput.ExpressionAttributeValues || {};
		scanInput.FilterExpression = scanInput.FilterExpression || '';
		
		scanInput.ExpressionAttributeNames['#dep'] = department;
		scanInput.ExpressionAttributeNames['#ac'] = 'active';
		scanInput.ExpressionAttributeValues[':ac'] = { BOOL: true };
		if ((scanInput.FilterExpression || '').length > 0) {
			scanInput.FilterExpression += ' AND ';
		}
		scanInput.FilterExpression += '#dep.#ac = :ac';
	}

	if (isTest) {
		scanInput.ExpressionAttributeNames = scanInput.ExpressionAttributeNames || {};
		scanInput.ExpressionAttributeValues = scanInput.ExpressionAttributeValues || {};
		scanInput.FilterExpression = scanInput.FilterExpression || '';

		scanInput.ExpressionAttributeNames['#t'] = 'isTest';
		scanInput.ExpressionAttributeValues[':t'] = {
			BOOL: true
		};
		if (scanInput.FilterExpression !== '') {
			scanInput.FilterExpression += ' AND ';
		}
		scanInput.FilterExpression += '#t = :t';
	}

	let promise = dynamodb.scan(scanInput).promise();

	return promise
		.then((data) => data.Items || []);
}

type AccountSidKey = `accountSid${string}`;
type AuthTokenKey = `authToken${string}`;

interface TwilioConfig {
	[key: AccountSidKey]: string;
	[key: AuthTokenKey]: string;
	accountSid: string;
	authToken: string;
	apiCode: string;
	voiceOutgoingSid: string;
	voiceApiSid: string;
	voiceApiSecret: string;
}

interface PhoneNumberConfig {
	name?: string;
	number: string;
	account?: 'Baca';
	type: 'page' | 'alert' | 'chat';
	department?: UserDepartment;
}

const twilioSecretId = process.env.TWILIO_SECRET as string;
const twilioPhoneCategories: { [key: string]: PhoneNumberConfig } = {
	pageBaca: {
		type: 'page',
		number: '***REMOVED***',
		account: 'Baca',
		department: 'Baca',
	},
	page: {
		number: '***REMOVED***',
		type: 'page',
		department: 'Crestone',
	},
	alerts: {
		number: '***REMOVED***',
		type: 'alert',
	},
	chatCrestone: {
		number: '***REMOVED***',
		type: 'chat',
		department: 'Crestone',
	},
	chatBaca: {
		number: '',
		account: 'Baca',
		type: 'chat',
		department: 'Baca',
	},
	chatNSCAD: {
		number: '',
		type: 'chat',
		department: 'NSCAD',
	},
};
export const twilioPhoneNumbers: { [key: string]: PhoneNumberConfig } = Object.keys(twilioPhoneCategories)
	.reduce((agg: {
		[key: string]: PhoneNumberConfig;
	}, key) => {
		agg[twilioPhoneCategories[key].number] = {
			name: key,
			...twilioPhoneCategories[key]
		};

		return agg;
	}, {});

let twilioSecret: null | Promise<TwilioConfig> = null;
export async function getTwilioSecret(): Promise<TwilioConfig> {
	logger.trace('getTwilioSecret', ...arguments);
	if (twilioSecret !== null) {
		return twilioSecret;
	}

	twilioSecret = secretManager.getSecretValue({
		SecretId: twilioSecretId
	}).promise()
		.then(data => JSON.parse(data.SecretString as string))
		.catch (e => {
			logger.error('getTwilioSecret', e);
			return null;
		});

	return twilioSecret;
}

export async function saveMessageData(
	messageId: string,
	recipients: number,
	body: string,
	mediaUrls: string[] = [],
	pageId: string | null = null,
	pageTg: number | null = null,
	isTest: boolean = false
) {
	logger.trace('saveMessageData', ...arguments);
	let promises: Promise<any>[] = [];
	promises.push(dynamodb.updateItem({
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
			'#tg': 'talkgroup',
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
			':tg': {
				S: pageTg !== null ? pageTg.toString() : ''
			},
			':t': {
				BOOL: isTest
			},
			':ts': {
				S: isTest ? 'y' : 'n'
			}
		},
		UpdateExpression: 'SET #r = :r, #b = :b, #m = :m, #p = :p, #pid = :pid, #tg = :tg, #t = :t, #ts = :ts'
	}).promise());

	const dataDate = new Date(Number(messageId));
	promises.push(cloudWatch.putMetricData({
		Namespace: `Twilio Health`,
		MetricData: [
			{
				MetricName: 'Initiated',
				Timestamp: dataDate,
				Unit: 'Count',
				Value: recipients
			}
		]
	}).promise()
		.catch(e => {
			logger.error('saveMesageData', 'twilio metrics', e);
		}));

	await Promise.all(promises);
}

export function getPageNumber(user: AWS.DynamoDB.AttributeMap): string {
	let phoneToUse = 'page';
	for (let i = 0; i < validDepartments.length; i++) {
		const dep = validDepartments[i];
		if (!user[dep]?.M?.active?.BOOL) {
			continue;
		}

		// Determine if the department has a different page number
		if (typeof twilioPhoneCategories[`page${dep}`] === 'undefined') {
			return 'page';
		}

		phoneToUse = `page${dep}`;
	}

	return phoneToUse;
}

interface TwilioMessageConfig {
	body: string;
	mediaUrl?: string[];
	from: string;
	to: string;
	statusCallback?: string;
}

export async function sendMessage(
	metricSource: string,
	messageId: string | null,
	phone: string,
	sendNumberCategory: string,
	body: string,
	mediaUrl: string[] = []
) {
	logger.trace('sendMessage', ...arguments);

	if (typeof twilioPhoneCategories[sendNumberCategory] === 'undefined') {
		logger.error('sendMessage', `Invalid number category - ${sendNumberCategory}`);
		await incrementMetric('Error', {
			source: metricSource,
			type: 'Invalid destination'
		});
		return;
	}
	const numberConfig = twilioPhoneCategories[sendNumberCategory];

	let saveMessageDataPromise: Promise<any> = new Promise(res => res(null));
	if (messageId === null) {
		messageId = Date.now().toString();
		saveMessageDataPromise = saveMessageData(
			messageId,
			1,
			body,
			mediaUrl,
			null,
			null,
			true
		);
	}

	const twilioConf = await getTwilioSecret();
	if (twilioConf === null)
		throw new Error('Cannot get twilio secret');

	let fromNumber = numberConfig.number;
	let accountSid: string = twilioConf[`accountSid${numberConfig.account || ''}`];
	let authToken: string = twilioConf[`authToken${numberConfig.account || ''}`];
	if (
		typeof fromNumber === 'undefined' ||
		typeof accountSid === 'undefined' ||
		typeof authToken === 'undefined'
	) {
		logger.error(`Invalid phone information`, fromNumber, accountSid, authToken);
		await incrementMetric('Error', {
			source: metricSource,
			type: `Invalid phone information`
		});
		return;
	}

	const messageConfig: TwilioMessageConfig = {
		body,
		mediaUrl,
		from: fromNumber,
		to: `+1${parsePhone(phone)}`,
		statusCallback: `https://fire.klawil.net/api/twilio?action=textStatus&code=${encodeURIComponent(twilioConf.apiCode)}&msg=${encodeURIComponent(messageId)}`
	};
	return Promise.all([
		twilio(accountSid, authToken)
			.messages.create(messageConfig),
		saveMessageDataPromise
	])
		.catch((e: any) => {
			logger.error('sendMessage', e);
		});
}

export type AlertType = 'Api' | 'Dtr' | 'Vhf';

export async function sendAlertMessage(metricSource: string, alertType: AlertType, body: string) {
	logger.trace('sendAlertMessage', ...arguments);
	const messageId = Date.now().toString();
	const recipients = (await getRecipients('all', null))
		.filter(user => user[`get${alertType}Alerts`]?.BOOL);
	await Promise.all([
		saveMessageData(messageId, recipients.length, body),
		...recipients
			.filter(user => typeof user.phone.N !== 'undefined')
			.map(user => sendMessage(
				metricSource,
				messageId,
				user.phone.N as string,
				'alerts',
				body,
				[]
			))
	]);
}

interface ErrorMetric {
	source: string;
	type: string;
}

interface CallMetric {
	source: string;
	action: string;
}

interface EventMetric {
	source: string;
	type: string;
	event: string;
}

export async function incrementMetric(
	name: 'Error',
	metricData: ErrorMetric,
	sendLessSpecific?: boolean,
	sendMoreSpecific?: boolean
): Promise<any>
export async function incrementMetric(
	name: 'Call',
	metricData: CallMetric,
	sendLessSpecific?: boolean,
	sendMoreSpecific?: boolean
): Promise<any>
export async function incrementMetric(
	name: 'Event',
	metricData: EventMetric,
	sendLessSpecific?: boolean,
	sendMoreSpecific?: boolean
): Promise<any>
export async function incrementMetric(
	name: string,
	metricData: ErrorMetric | CallMetric | EventMetric,
	sendLessSpecific: boolean = true,
	sendMoreSpecific: boolean = true
): Promise<any> {
	logger.trace('incrementMetric', ...arguments);
	const putConfig: aws.CloudWatch.PutMetricDataInput = {
		Namespace: `CVFD API`,
		MetricData: []
	};

	if (sendLessSpecific && name !== 'Event') {
		putConfig.MetricData.push({
			MetricName: name,
			Dimensions: [
				{
					Name: 'source',
					Value: metricData.source
				}
			],
			Timestamp: new Date(),
			Unit: 'Count',
			Value: 1
		});
	}

	if (sendMoreSpecific && name !== 'Error') {
		putConfig.MetricData.push({
			MetricName: name,
			Dimensions: (Object.keys(metricData) as Array<keyof typeof metricData>)
				.reduce((agg: aws.CloudWatch.Dimensions, key) => [
					...agg,
					{
						Name: key,
						Value: metricData[key]
					}
				], []),
			Timestamp: new Date(),
			Unit: 'Count',
			Value: 1
		});
	}

	await cloudWatch.putMetricData(putConfig).promise();
}

export function validateBodyIsJson(body: string | null): true {
	logger.trace('validateBodyIsJson', ...arguments);
	if (body === null) {
		throw new Error(`Invalid JSON body - null`);
	}

	JSON.parse(body);

	return true;
}

export function randomString(len: number, numeric = false): string {
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
