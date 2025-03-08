import * as AWS from 'aws-sdk';
import * as lambda from 'aws-lambda';
const twilio = require('twilio');

const dynamodb = new AWS.DynamoDB();
const secretManager = new AWS.SecretsManager();

const phoneTable = process.env.TABLE_PHONE as string;

const twilioSecretId = process.env.TWILIO_SECRET as string;
const twilioSecretPromise = secretManager.getSecretValue({
	SecretId: twilioSecretId
}).promise()
	.then((data) => JSON.parse(data.SecretString as string))
	.catch((e) => {
		console.error(e);
		return null;
	});

const codeTtl = 1000 * 60 * 5;

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

async function sendMessage(phone: string, body: string) {
	const twilioConf = await twilioSecretPromise;
	if (twilioConf === null) {
		throw new Error('Cannot get twilio secret');
	}

	return twilio(twilioConf.accountSid, twilioConf.authToken)
		.messages.create({
			body,
			from: twilioConf.fromNumber as string,
			to: `+1${phone.replace(/[^0-9]/g, '')}`
		});
}

interface RegisterBody {
	action: 'register';
	phone: string;
	name: string;
	captcha: string;
}

async function handleRegister(body: RegisterBody) {
	const promises: Promise<any>[] = [];

	// Create the verification code
	const verificationCode = randomString(6, true);

	// Create the user in the table
	promises.push(dynamodb.putItem({
		TableName: phoneTable,
		Item: {
			phone: {
				N: body.phone.replace(/[^0-9]/g, '')
			},
			name: {
				S: body.name
			},
			code: {
				N: verificationCode
			},
			codeExpiry: {
				N: (Date.now() + codeTtl).toString()
			}
		}
	}).promise());

	// Send the verification message
	promises.push(sendMessage(body.phone, `Your validation code for Crestone Fire Notifications is ${verificationCode}`));

	await Promise.all(promises);
}

async function parseRecord(event: lambda.SQSRecord) {
	const body = JSON.parse(event.body);
	switch (body.action) {
		case 'register':
			return handleRegister(body);
	}
}

export async function main(event: lambda.SQSEvent) {
	await Promise.all(event.Records.map(parseRecord));
}
