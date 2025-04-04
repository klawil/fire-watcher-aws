import * as aws from 'aws-sdk';
import { PhoneNumberAccount, PhoneNumberTypes, UserDepartment, validDepartments, ValidTwilioAccounts, ValidTwilioNumberTypes } from '../../../common/userConstants';
import { getLogger } from './logger';
import { MessageType } from '../../../common/frontendApi';

const logger = getLogger('u-gen');
const twilio = require('twilio'); // eslint-disable-line @typescript-eslint/no-require-imports

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
	const scanInput: AWS.DynamoDB.QueryInput = {
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

	const promise = dynamodb.scan(scanInput).promise();

	return promise
		.then((data) => data.Items || []);
}

type AccountSidKey = `accountSid${ValidTwilioAccounts}`;
type AuthTokenKey = `authToken${ValidTwilioAccounts}`;
type PhoneNumberKey = `phoneNumber${ValidTwilioAccounts}${ValidTwilioNumberTypes}`;

type TwilioConfig = {
	[key in AccountSidKey]: string;
} & {
	[key in AuthTokenKey]: string;
} & {
	[key in PhoneNumberKey]?: string;
} & {
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
	numberKey: PhoneNumberKey;
	account?: PhoneNumberAccount;
	type: ValidTwilioNumberTypes;
	department?: UserDepartment;
}

type TwilioPhoneCategories = {
	[key in PhoneNumberTypes]?: PhoneNumberConfig;
}

const twilioSecretId = process.env.TWILIO_SECRET as string;
let cachedTwilioPhoneCategories: null | Promise<TwilioPhoneCategories> = null;
export const twilioPhoneCategories: () => Promise<TwilioPhoneCategories> = async () => {
	if (cachedTwilioPhoneCategories === null) {
		cachedTwilioPhoneCategories = (async () => {
			const baseObject: TwilioPhoneCategories = {
				pageBaca: {
					type: 'page',
					number: '',
					numberKey: 'phoneNumberBacapage',
					account: 'Baca',
					department: 'Baca',
				},
				page: {
					number: '',
					numberKey: 'phoneNumberCrestonepage',
					type: 'page',
					account: 'Crestone',
				},
				alert: {
					number: '',
					numberKey: 'phoneNumberalert',
					type: 'alert',
				},
				chatCrestone: {
					number: '',
					numberKey: 'phoneNumberCrestonechat',
					type: 'chat',
					department: 'Crestone',
					account: 'Crestone',
				},
				chatNSCAD: {
					number: '',
					numberKey: 'phoneNumberNSCADchat',
					type: 'chat',
					department: 'NSCAD',
					account: 'NSCAD',
				},
				pageNSCAD: {
					number: '',
					numberKey: 'phoneNumberNSCADpage',
					type: 'page',
					department: 'NSCAD',
					account: 'NSCAD',
				},
				pageSaguache: {
					number: '',
					numberKey: 'phoneNumberSaguachepage',
					type: 'page',
					department: 'Saguache',
					account: 'Saguache',
				},
			};

			const twilioConf = await getTwilioSecret();

			(Object.keys(baseObject) as (keyof TwilioPhoneCategories)[]).forEach(key => {
				if (
					typeof baseObject[key] === 'undefined' ||
					typeof twilioConf[baseObject[key].numberKey] === 'undefined'
				) {
					delete baseObject[key];
					return;
				}

				baseObject[key].number = twilioConf[baseObject[key].numberKey] as string;
			});
			return baseObject;
		})();
	}

	return cachedTwilioPhoneCategories;
};

interface TwilioPhoneNumbers {
	[key: string]: PhoneNumberConfig;
};
let cachedTwilioPhoneNumbers: null | Promise<TwilioPhoneNumbers> = null;
export const twilioPhoneNumbers: () => Promise<TwilioPhoneNumbers> = async () => {
	if (cachedTwilioPhoneNumbers === null) {
		cachedTwilioPhoneNumbers = (async () => {
			const phoneCategories = await twilioPhoneCategories();
			return (Object.keys(phoneCategories) as (keyof TwilioPhoneCategories)[])
				.reduce((agg: TwilioPhoneNumbers, key) => {
					if (typeof phoneCategories[key] !== 'undefined') {
						agg[phoneCategories[key].number] = {
							name: key,
							...phoneCategories[key]
						};
					}

					return agg;
				}, {});
			})();
	}
	return cachedTwilioPhoneNumbers;
}

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

// group and groupAnnounce need a department associated with them
// page announce should have a pageTg associated
const departmentRequired: MessageType[] = [
	'department',
	'departmentAnnounce',
	'departmentAlert',
];

export async function saveMessageData(
	messageType: MessageType,
	messageId: string,
	recipients: number,
	body: string,
	mediaUrls: string[] = [],
	pageId: string | null = null,
	pageTg: number | null = null,
	department: UserDepartment | null = null,
	isTest: boolean = false
) {
	logger.trace('saveMessageData', ...arguments);
	const promises: Promise<any>[] = [];
	if (departmentRequired.includes(messageType) && department === null) {
		department = 'PageOnly';
	}
	const updateItemParams: aws.DynamoDB.UpdateItemInput & Required<Pick<aws.DynamoDB.UpdateItemInput, 'ExpressionAttributeNames' | 'ExpressionAttributeValues' | 'UpdateExpression'>> = {
		TableName: messagesTable,
		Key: {
			datetime: {
				N: messageId,
			},
		},
		ExpressionAttributeNames: {
			'#r': 'recipients',
			'#b': 'body',
			'#tpi': 'testPageIndex',
			'#p': 'isPage',
			'#t': 'isTest',
			'#ts': 'isTestString',
			'#mt': 'type',
		},
		ExpressionAttributeValues: {
			':r': {
				N: recipients.toString()
			},
			':b': {
				S: body
			},
			':p': {
				BOOL: pageId !== null
			},
			':t': {
				BOOL: isTest
			},
			':ts': {
				S: isTest ? 'y' : 'n'
			},
			':tpi': {
				S: `${isTest ? 'y' : 'n'}${pageId !== null ? 'y' : 'n'}`,
			},
			':mt': {
				S: messageType,
			},
		},
		UpdateExpression: 'SET #r = :r, #b = :b, #p = :p, #t = :t, #ts = :ts, #mt = :mt, #tpi = :tpi',
	};
	if (department !== null) {
		updateItemParams.ExpressionAttributeNames['#dep'] = 'department';
		updateItemParams.ExpressionAttributeValues[':dep'] = { S: department };
		updateItemParams.UpdateExpression += ', #dep = :dep';
	}
	if (pageTg !== null) {
		updateItemParams.ExpressionAttributeNames['#tg'] = 'talkgroup';
		updateItemParams.ExpressionAttributeValues[':tg'] = { S: pageTg.toString() };
		updateItemParams.UpdateExpression += ', #tg = :tg';
	}
	if (pageId !== null) {
		updateItemParams.ExpressionAttributeNames['#pid'] = 'pageId';
		updateItemParams.ExpressionAttributeValues[':pid'] = { S: pageId };
		updateItemParams.UpdateExpression += ', #pid = :pid';
	}
	if (mediaUrls.length > 0) {
		updateItemParams.ExpressionAttributeNames['#mu'] = 'mediaUrls';
		updateItemParams.ExpressionAttributeValues[':mu'] = { S: mediaUrls.join(', ') };
		updateItemParams.UpdateExpression += ', #mu = :mu';
	}
	promises.push(dynamodb.updateItem(updateItemParams).promise());

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

const DEFAULT_PAGE_NUMBER = 'page';
export async function getPageNumber(user: AWS.DynamoDB.AttributeMap): Promise<PhoneNumberTypes> {
	// Loop over the departments the person is a member of and look for paging groups
	const possibleDepartments: UserDepartment[] = [];
	for (let i = 0; i < validDepartments.length; i++) {
		const dep = validDepartments[i];
		if (!user[dep]?.M?.active?.BOOL) {
			continue;
		}
		possibleDepartments.push(dep);
	}

	// Use the only department if there is one
	const resolvedTwilioPhoneCategories = await twilioPhoneCategories();
	if (possibleDepartments.length === 1) {
		return typeof resolvedTwilioPhoneCategories[`page${possibleDepartments[0]}` as PhoneNumberTypes] !== 'undefined'
			? `page${possibleDepartments[0]}` as PhoneNumberTypes
			: DEFAULT_PAGE_NUMBER;
	}

	// Check for explicitly set paging number usage
	if (
		typeof user.pagingPhone?.S !== 'undefined' &&
		validDepartments.includes(user.pagingPhone.S as UserDepartment) &&
		typeof resolvedTwilioPhoneCategories[`page${user.pagingPhone.S as UserDepartment}` as PhoneNumberTypes] !== 'undefined'
	) {
		return `page${user.pagingPhone.S as UserDepartment}` as PhoneNumberTypes;
	}

	// Use the global paging number if the user is:
	// - a member of multiple departments without a paging number set
	// - a member no departments
	return DEFAULT_PAGE_NUMBER;
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
	messageType: MessageType,
	messageId: string | null,
	phone: string,
	sendNumberCategory: PhoneNumberTypes,
	body: string,
	mediaUrl: string[] = []
) {
	logger.trace('sendMessage', ...arguments);

	const resolvedTwilioPhoneCategories = await twilioPhoneCategories();
	if (typeof resolvedTwilioPhoneCategories[sendNumberCategory] === 'undefined') {
		logger.error('sendMessage', `Invalid number category - ${sendNumberCategory}`);
		await incrementMetric('Error', {
			source: metricSource,
			type: 'Invalid destination'
		});
		return;
	}
	const numberConfig = resolvedTwilioPhoneCategories[sendNumberCategory];

	let saveMessageDataPromise: Promise<any> = new Promise(res => res(null));
	if (messageId === null) {
		messageId = Date.now().toString();
		saveMessageDataPromise = saveMessageData(
			messageType,
			messageId,
			1,
			body,
			mediaUrl,
			null,
			null,
			null,
			true
		);
	}

	const twilioConf = await getTwilioSecret();
	if (twilioConf === null)
		throw new Error('Cannot get twilio secret');

	const fromNumber = numberConfig.number;
	const accountSid: string = twilioConf[`accountSid${numberConfig.account || ''}`];
	const authToken: string = twilioConf[`authToken${numberConfig.account || ''}`];
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
		statusCallback: `https://cofrn.org/api${numberConfig.account ? `/${numberConfig.account}` : ''}/twilio?action=textStatus&code=${encodeURIComponent(twilioConf.apiCode)}&msg=${encodeURIComponent(messageId)}`
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
		saveMessageData('alert', messageId, recipients.length, body),
		...recipients
			.filter(user => typeof user.phone.N !== 'undefined')
			.map(user => sendMessage(
				metricSource,
				'alert',
				messageId,
				user.phone.N as string,
				'alert',
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
	const str: string[] = [];

	for (let i = 0; i < len; i++) {
		str[i] = chars[Math.floor(Math.random() * chars.length)];
	}

	return str.join('');
}
