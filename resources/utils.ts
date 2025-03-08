import * as AWS from 'aws-sdk';
const twilio = require('twilio');

const secretManager = new AWS.SecretsManager();

type DynamoDbValues = boolean | number | string | undefined | AWS.DynamoDB.AttributeValue | DynamoDbValues[];

function parseDynamoDbAttributeValue(value: AWS.DynamoDB.AttributeValue): DynamoDbValues {
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
	}

	return value;
}

interface NewObject {
	[key: string]: DynamoDbValues | NewObject;
}

export function parseDynamoDbAttributeMap(item: AWS.DynamoDB.AttributeMap): NewObject {
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

interface TwilioConfig {
	accountSid: string;
	authToken: string;
	fromNumber: string;
	pageNumber: string;
}

const twilioSecretId = process.env.TWILIO_SECRET as string;
const apiCode = process.env.SERVER_CODE as string;

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

interface TwilioMessageConfig {
	body: string;
	mediaUrl?: string[];
	from: string;
	to: string;
	statusCallback?: string;
}

export async function sendMessage(
	messageId: string | null,
	phone: string | undefined,
	body: string,
	mediaUrl: string[] = [],
	isPage: boolean = false
) {
	if (typeof phone === 'undefined') {
		return;
	}

	const twilioConf = await getTwilioSecret();
	if (twilioConf === null) {
		throw new Error('Cannot get twilio secret');
	}

	const messageConfig: TwilioMessageConfig = {
		body,
		mediaUrl,
		from: isPage ? twilioConf.pageNumber : twilioConf.fromNumber,
		to: `+1${parsePhone(phone)}`
	};

	if (messageId !== null) {
		messageConfig.statusCallback = `https://fire.klawil.net/api?action=messageStatus&code=${encodeURIComponent(apiCode)}&msg=${encodeURIComponent(messageId)}`;
	}

	return twilio(twilioConf.accountSid, twilioConf.authToken)
		.messages.create(messageConfig)
		.catch((e: any) => {
			console.log(`QUEUE - ERROR - sendMessage`);
			console.error(e);
		});
}
