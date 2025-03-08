import * as aws from 'aws-sdk';
import { UserDepartment, defaultDepartment, departmentConfig } from '../../../common/userConstants';
const twilio = require('twilio');

const messagesTable = process.env.TABLE_MESSAGES as string;
const phoneTable = process.env.TABLE_USER as string;

const secretManager = new aws.SecretsManager();
const cloudWatch = new aws.CloudWatch();
const dynamodb = new aws.DynamoDB();

type DynamoDbValues = boolean | number | string | undefined | aws.DynamoDB.AttributeValue | DynamoDbValues[];

export function parseDynamoDbAttributeValue(value: aws.DynamoDB.AttributeValue): DynamoDbValues {
	if (typeof value.S !== 'undefined') {
		return value.S;
	} else if (typeof value.N !== 'undefined') {
		return parseFloat(value.N as string);
	} else if (typeof value.BOOL !== 'undefined') {
		return value.BOOL;
	} else if (typeof value.L !== 'undefined') {
		return value.L?.map(parseDynamoDbAttributeValue);
	} else if (typeof value.NS !== 'undefined') {
		return value.NS?.map(val => parseFloat(val));
	} else if (typeof value.SS !== 'undefined') {
		return value.SS;
	} else if (typeof value.M !== 'undefined') {
		return parseDynamoDbAttributeMap(value.M);
	}

	return value;
}

interface NewObject {
	[key: string]: DynamoDbValues | NewObject;
}

export function parseDynamoDbAttributeMap(item: aws.DynamoDB.AttributeMap): NewObject {
	const newObj: NewObject = {};

	Object.keys(item)
		.forEach(key => {
			newObj[key] = parseDynamoDbAttributeValue(item[key]);
		});

	return newObj;
}

export function parsePhone(num: string, toHuman: boolean = false): string {
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
	if (pageTg === null) {
		scanInput.ExpressionAttributeNames = scanInput.ExpressionAttributeNames || {};
		scanInput.ExpressionAttributeValues = scanInput.ExpressionAttributeValues || {};

		scanInput.ExpressionAttributeNames['#po'] = 'pageOnly';
		scanInput.ExpressionAttributeValues[':po'] = {
			BOOL: false
		};
		scanInput.FilterExpression += ' AND (#po = :po OR attribute_not_exists(#po))';
	} else {
		scanInput.ExpressionAttributeNames = scanInput.ExpressionAttributeNames || {};
		scanInput.ExpressionAttributeValues = scanInput.ExpressionAttributeValues || {};

		scanInput.FilterExpression += ' AND contains(#tg, :tg)';
		scanInput.ExpressionAttributeNames['#tg'] = 'talkgroups';
		scanInput.ExpressionAttributeValues[':tg'] = { N: pageTg.toString() };
	}
	if (department !== 'all') {
		scanInput.ExpressionAttributeNames = scanInput.ExpressionAttributeNames || {};
		scanInput.ExpressionAttributeValues = scanInput.ExpressionAttributeValues || {};

		scanInput.IndexName = 'StationIndex2';
		scanInput.KeyConditionExpression = '#dep = :dep';
		scanInput.ExpressionAttributeNames['#dep'] = 'department';
		scanInput.ExpressionAttributeValues[':dep'] = { S: department };
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

const twilioSecretId = process.env.TWILIO_SECRET as string;

let twilioSecret: null | Promise<TwilioConfig> = null;
export async function getTwilioSecret(): Promise<TwilioConfig> {
	if (twilioSecret !== null) {
		return twilioSecret;
	}

	twilioSecret = secretManager.getSecretValue({
		SecretId: twilioSecretId
	}).promise()
		.then(data => JSON.parse(data.SecretString as string))
		.catch (e => {
			console.error(e);
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
			console.error(`Error with metrics`);
			console.error(e);
		}));

	await Promise.all(promises);
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
	phone: string | undefined,
	department: UserDepartment,
	body: string,
	mediaUrl: string[] = [],
	isPage: boolean = false,
	isAlert: boolean = false
) {
	const depConf = departmentConfig[department || defaultDepartment] || departmentConfig[defaultDepartment];

	if (
		typeof phone === 'undefined' ||
		typeof department === 'undefined' ||
		typeof depConf === 'undefined'
	) {
		console.error(`Trying to send message to invalid destination\nphone: ${phone}\ndepartment: ${department}\nMessage: ${body}`);
		await incrementMetric('Error', {
			source: metricSource,
			type: 'Invalid destination'
		});
		return;
	}

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

	let fromNumberType: 'paging' | 'textGroup' | 'alerts' = isPage
		? 'paging'
		: isAlert
			? 'alerts'
			: 'textGroup';
	let fromNumber = depConf[`${fromNumberType}Phone`];
	let accountSid: string = twilioConf[`accountSid${depConf.twilioAccount}`];
	let authToken: string = twilioConf[`authToken${depConf.twilioAccount}`];
	if (
		typeof fromNumber === 'undefined' ||
		typeof accountSid === 'undefined' ||
		typeof authToken === 'undefined'
	) {
		accountSid = twilioConf.accountSid;
		authToken = twilioConf.authToken;
		fromNumber = departmentConfig[defaultDepartment][`${fromNumberType}Phone`] as string;
		await incrementMetric('Error', {
			source: metricSource,
			type: `Invalid combination of department and type: ${department} and ${fromNumberType}`
		});
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
			console.log(`QUEUE - ERROR - sendMessage`);
			console.error(e);
		});
}

export type AlertType = 'Api' | 'Dtr' | 'Vhf';

export async function sendAlertMessage(metricSource: string, alertType: AlertType, body: string) {
	const messageId = Date.now().toString();
	const recipients = (await getRecipients('all', null))
		.filter(user => user[`get${alertType}Alerts`]?.BOOL);
	await Promise.all([
		saveMessageData(messageId, recipients.length, body),
		...recipients.map(user => sendMessage(
			metricSource,
			messageId,
			user.phone.N,
			defaultDepartment,
			body,
			[],
			false,
			true
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
	console.log(`METRIC - ${metricData.source} - ${name} - ${JSON.stringify(metricData)}`);
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
	if (body === null) {
		throw new Error(`Invalid JSON body - null`);
	}

	JSON.parse(body);

	return true;
}

export function randomString(len: number, numeric = false): string {
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
