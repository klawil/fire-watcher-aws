import * as aws from 'aws-sdk';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getTwilioSecret, incrementMetric, parsePhone, twilioPhoneNumbers } from '../utils/general';
import { TwilioBody, TwilioErrorBody } from '../types/queue';
import { departmentConfig, UserDepartment, validDepartments } from '../../../common/userConstants';
import { getLogger } from '../utils/logger';
import { isUserActive } from '../types/auth';
import { getLoggedInUser } from '../utils/auth';

const logger = getLogger('twilio');

const metricSource = 'Twilio';

const dynamodb = new aws.DynamoDB();
const sqs = new aws.SQS();
const cloudWatch = new aws.CloudWatch();

const sqsQueue = process.env.SQS_QUEUE as string;
const userTable = process.env.TABLE_USER as string;
const textTable = process.env.TABLE_MESSAGES as string;
const conferenceTable = process.env.TABLE_CONFERENCE as string;

interface TwilioTextEvent {
	From: string;
	To: string;
	Body: string;
	MediaUrl0?: string;
	CallSid: string;
	Type?: string;
	ParentCallSid?: string;
	Direction?: string;
}

interface TwilioStatusEvent {
	SmsSid: string;
	SmsStatus: string;
	MessageStatus: string; // Use me!
	To: string;
	MessageSid: string;
	AccountSid: string;
	From: string;
	ApiVersion: string;
}

interface TextCommand {
	response: string;
	update: {
		ExpressionAttributeNames: aws.DynamoDB.ExpressionAttributeNameMap;
		ExpressionAttributeValues?: aws.DynamoDB.ExpressionAttributeValueMap;
		UpdateExpression: string;
	};
};

const textCommands: {
	[key: string]: TextCommand;
} = {
	'!startTest': {
		response: 'Testing mode enabled',
		update: {
			ExpressionAttributeNames: {
				'#it': 'isTest'
			},
			ExpressionAttributeValues: {
				':it': {
					BOOL: true
				}
			},
			UpdateExpression: 'SET #it = :it'
		}
	},
	'!endTest': {
		response: 'Testing mode disabled',
		update: {
			ExpressionAttributeNames: {
				'#it': 'isTest'
			},
			UpdateExpression: 'REMOVE #it'
		}
	}
};

const applePrefixes = [
	'Liked',
	'Loved',
	'Disliked',
	'Laughed+at',
	'Questioned',
]
	.map(p => `${p}+`);

async function handleText(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.trace('handleText', ...arguments);
	const code = event.queryStringParameters?.code;
	const response: APIGatewayProxyResult = {
		statusCode: 200,
		headers: {
			'Content-Type': 'application/xml'
		},
		body: '<Response></Response>'
	};

	// Get the API code
	const twilioConf = await getTwilioSecret();

	// Validate the call is from Twilio
	if (code !== twilioConf.apiCode) {
		await incrementMetric('Error', {
			source: metricSource,
			type: 'Missing auth Twilio'
		});
		return response;
	}

	// Get the event data
	const eventData = event.body?.split('&')
		.map(str => str.split('=').map(str => decodeURIComponent(str)))
		.reduce((acc, curr) => ({
			...acc,
			[curr[0]]: curr[1] || ''
		}), {}) as TwilioTextEvent;

	// Check for config for the department
	const phoneNumberConfig = twilioPhoneNumbers[eventData.To];
	if (
		typeof phoneNumberConfig === 'undefined' ||
		phoneNumberConfig.type === 'alert'
	) {
		response.body = `<Response><Message>Hmmm, it looks like you sent this to the wrong numer</Message></Response>`;
		return response;
	}
	const phoneNumberDepartments = (Object.keys(departmentConfig) as UserDepartment[])
		.filter(dep => departmentConfig[dep]?.pagePhone === phoneNumberConfig.name ||
			departmentConfig[dep]?.textPhone === phoneNumberConfig.name);
	
	// Validate the sending number
	const sender = await dynamodb.getItem({
		TableName: userTable,
		Key: {
			phone: {
				N: eventData.From.slice(2)
			}
		}
	}).promise();
	if (
		!sender.Item ||
		!isUserActive(sender.Item)
	) {
		response.body = `<Response><Message>You do not have access to use the text group. Contact your station chief to request access.</Message></Response>`
		return response;
	}
	const userActiveDepartments = phoneNumberDepartments
		.filter(dep => sender.Item && sender.Item[dep]?.M?.active?.BOOL);
	const userAdminDepartments = userActiveDepartments
		.filter(dep => sender.Item && sender.Item[dep]?.M?.admin?.BOOL);
	if (userActiveDepartments.length === 0) {
		response.body = `<Response><Message>You do not have access to use the text group. Contact your station chief to request access.</Message></Response>`
		return response;
	}

	// See if this number is associated with multiple departments the user is active on
	if (
		phoneNumberDepartments.length > 1 &&
		(
			( // Texting a page number and >1 admin departments or >1 active departments and no admins
				phoneNumberConfig.type === 'page' &&
				(
					userAdminDepartments.length > 1 ||
					(
						userAdminDepartments.length === 0 &&
						userActiveDepartments.length > 1
					)
				)
			) ||
			( // Texting a chat number and >1 active departments
				phoneNumberConfig.type === 'chat' &&
				userActiveDepartments.length > 1
			)
		)
	) {
		response.body = `<Response><Message>You have access to multiple departments that use this number. You will have to use the web UI to send a message.</Message></Response>`
		return response;
	}

	// Check for text commands and apple responses
	const isTextCommand = typeof textCommands[eventData.Body] !== 'undefined';
	const isAppleResponse = applePrefixes
		.filter(prefix => eventData.Body.indexOf(prefix) === 0)
		.length > 0;
	const isCarResponse = eventData.Body.indexOf(`I'm+Driving`) !== -1 &&
		eventData.Body.indexOf(`Sent+from+My+Car`) !== -1;

	// Handle text commands
	if (isTextCommand) {
		await incrementMetric('Event', {
			source: metricSource,
			type: 'handleText',
			event: 'command'
		});
		await dynamodb.updateItem({
			TableName: userTable,
			Key: {
				phone: {
					N: sender.Item.phone.N
				}
			},
			...textCommands[eventData.Body].update
		}).promise();

		response.body = `<Response><Message>${textCommands[eventData.Body].response}</Message></Response>`;
	} else if (isAppleResponse) {
		await incrementMetric('Event', {
			source: metricSource,
			type: 'handleText',
			event: 'apple'
		});
	} else if (isCarResponse) {
		await incrementMetric('Event', {
			source: metricSource,
			type: 'handleText',
			event: 'car'
		});
	} else if (event.body !== null && event.body.length > 1250) {
		response.body = `<Response><Message>Message too long. Please keep messages to less than 1,250 characters</Message></Response>`;
	} else if (event.body !== null) {
		const queueMessage: TwilioBody = {
			action: 'twilio',
			body: event.body,
		};
		await sqs.sendMessage({
			MessageBody: JSON.stringify(queueMessage),
			QueueUrl: sqsQueue
		}).promise();
	}

	return response;
}

async function handleTextStatus(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.trace('handleTextStatus', ...arguments);
	const eventDatetime = Date.now();
	const code = event.queryStringParameters?.code;
	const messageId = event.queryStringParameters?.msg || null;
	const response: APIGatewayProxyResult = {
		statusCode: 204,
		body: ''
	};

	// Get the API code
	const twilioConf = await getTwilioSecret();

	// Validate the call is from Twilio
	if (code !== twilioConf.apiCode) {
		logger.error('handleTextStatus', 'invalid API code');
		await incrementMetric('Error', {
			source: metricSource,
			type: 'Invalid Twilio code'
		});
	} else if (messageId === null) {
		logger.error('handleTextStatus', 'invalid message ID');
		await incrementMetric('Error', {
			source: metricSource,
			type: 'Invalid message ID'
		});
	} else {
		const eventData = event.body?.split('&')
			.map(str => str.split('=').map(str => decodeURIComponent(str)))
			.reduce((agg, curr) => ({
				...agg,
				[curr[0]]: curr[1] || ''
			}), {}) as TwilioStatusEvent;

		let promises: Promise<any>[] = [];
		promises.push(dynamodb.updateItem({
			TableName: textTable,
			Key: {
				datetime: {
					N: messageId
				}
			},
			ExpressionAttributeNames: {
				'#eventName': eventData.MessageStatus,
				'#eventPhoneList': `${eventData.MessageStatus}Phone`,
				'#from': 'fromNumber'
			},
			ExpressionAttributeValues: {
				':eventListItem': {
					NS: [
						eventDatetime.toString()
					]
				},
				':eventPhoneListItem': {
					SS: [
						eventData.To
					]
				},
				':from': {
					S: eventData.From
				}
			},
			UpdateExpression: 'ADD #eventName :eventListItem, #eventPhoneList :eventPhoneListItem SET #from = :from'
		}).promise());

		if ([ 'undelivered', 'delivered' ].indexOf(eventData.MessageStatus) !== -1) {
			promises.push(dynamodb.getItem({
				TableName: userTable,
				Key: {
					phone: { N: eventData.To.slice(2) }
				}
			}).promise()
				.then(result => {
					if (!result || !result.Item) return null;

					if (eventData.MessageStatus === 'delivered') {
						return dynamodb.updateItem({
							TableName: userTable,
							Key: {
								phone: { N: eventData.To.slice(2) },
							},
							ExpressionAttributeNames: {
								'#ls': 'lastStatus',
								'#lsc': 'lastStatusCount',
							},
							ExpressionAttributeValues: {
								':ls': { S: eventData.MessageStatus },
							},
							UpdateExpression: 'SET #ls = :ls REMOVE #lsc',
							ReturnValues: 'ALL_NEW'
						}).promise();
					}

					return dynamodb.updateItem({
						TableName: userTable,
						Key: {
							phone: { N: eventData.To.slice(2) }
						},
						ExpressionAttributeNames: {
							'#ls': 'lastStatus',
							'#lsc': 'lastStatusCount'
						},
						ExpressionAttributeValues: {
							':ls': { S: eventData.MessageStatus },
							':lsc': { N: ((result.Item.lastStatus?.S === eventData.MessageStatus
								? parseInt(result.Item.lastStatusCount?.N || '0', 10)
								: 0) + 1).toString() }
						},
						UpdateExpression: 'SET #ls = :ls, #lsc = :lsc',
						ReturnValues: 'ALL_NEW'
					}).promise();
				})
				.then(result => {
					if (result === null) return null;

					if (
						result.Attributes?.lastStatus?.S === 'undelivered' &&
						parseInt(result.Attributes?.lastStatusCount?.N || '0', 10) > 0 &&
						parseInt(result.Attributes?.lastStatusCount?.N || '0', 10) % 5 === 0
					) {
						const queueMessage: TwilioErrorBody = {
							action: 'twilio_error',
							count: parseInt(result.Attributes?.lastStatusCount?.N || '0', 10),
							name: `${result.Attributes?.fName?.S} ${result.Attributes?.lName?.S}`,
							number: parsePhone(result.Attributes?.phone?.N || '', true),
							department: validDepartments.filter(dep => result.Attributes && result.Attributes[dep]?.M?.active?.BOOL)
						};
						return sqs.sendMessage({
							MessageBody: JSON.stringify(queueMessage),
							QueueUrl: sqsQueue
						}).promise();
					}

					return null;
				}));
		}

		if (eventData.MessageStatus !== 'undelivered') {
			const metricName = eventData.MessageStatus.slice(0, 1).toUpperCase() + eventData.MessageStatus.slice(1);
			const messageTime = new Date(Number(messageId));
			promises.push(cloudWatch.putMetricData({
				Namespace: 'Twilio Health',
				MetricData: [
					{
						MetricName: metricName,
						Timestamp: messageTime,
						Unit: 'Count',
						Value: 1
					},
					{
						MetricName: `${metricName}Time`,
						Timestamp: messageTime,
						Unit: 'Milliseconds',
						Value: eventDatetime - messageTime.getTime()
					}
				]
			}).promise()
				.catch(e => {
					logger.error('handleTextStatus', 'metrics', e);
				}));
		}

		await Promise.all(promises);
	}

	return response;
}

async function handleVoice(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.trace('handleVoice', ...arguments);
	const code = event.queryStringParameters?.code;
	const response: APIGatewayProxyResult = {
		statusCode: 200,
		headers: {
			'Content-Type': 'application/xml'
		},
		body: '<Response><Reject></Reject></Response>'
	};

	// Get the API code
	const twilioConf = await getTwilioSecret();

	// Validate the call is from Twilio
	if (code !== twilioConf.apiCode) {
		await incrementMetric('Error', {
			source: metricSource,
			type: 'Missing auth Twilio'
		});
		return response;
	}

	// Validate the sending number
	const eventData = event.body?.split('&')
		.map(str => str.split('=').map(str => decodeURIComponent(str)))
		.reduce((acc, curr) => ({
			...acc,
			[curr[0]]: curr[1] || ''
		}), {}) as TwilioTextEvent;
	if (typeof eventData.From !== 'string' || !/^\d+$/.test(eventData.From.slice(2))) {
		await incrementMetric('Error', {
			source: metricSource,
			type: 'Invalid Twilio source'
		});
		return response;
	}
	const sender = await dynamodb.getItem({
		TableName: userTable,
		Key: {
			phone: {
				N: eventData.From.slice(2)
			}
		}
	}).promise();
	if (
		!sender.Item ||
		!isUserActive(sender.Item) ||
		sender.Item.department?.S === 'Baca'
	) {
		return response;
	}

	let callSid: string = eventData.CallSid;
	if (
		eventData.Direction &&
		eventData.Direction !== 'inbound' &&
		eventData.ParentCallSid
	) {
		callSid = eventData.ParentCallSid;
	}

	await dynamodb.updateItem({
		TableName: conferenceTable,
		Key: {
			CallSid: {
				S: callSid,
			},
		},
		ExpressionAttributeNames: {
			'#cs': 'CallSign',
			'#fn': 'FirstName',
			'#ln': 'LastName',
			'#p': 'Phone',
			'#t': 'Type',
			'#r': 'Room',
		},
		ExpressionAttributeValues: {
			':cs': sender.Item.callSignS,
			':fn': sender.Item.fName,
			':ln': sender.Item.lName,
			':p': sender.Item.phone,
			':t': { S: eventData.Type || 'Phone' },
			':r': sender.Item.department,
		},
		UpdateExpression: 'SET #cs = :cs, #fn = :fn, #ln = :ln, #p = :p, #t = :t, #r = :r',
	}).promise();

	response.body = `<?xml version="1.0" encoding="UTF-8"?>
	<Response>
		<Say>Welcome ${sender.Item.fName.S}. Connecting you to the ${sender.Item.department.S} conference now</Say>
		<Dial>
			<Conference
				participantLabel="${sender.Item.fName.S} ${sender.Item.lName.S} ${Math.round(Math.random() * 100)}"
				statusCallback="https://cofrn.org/api/conference?action=join&amp;code=${encodeURIComponent(twilioConf.apiCode)}"
				statusCallbackEvents="start end join leave mute">
			${sender.Item.department.S}</Conference>
		</Dial>
	</Response>`;

	return response;
}

interface TwilioUsageItem {
	accountSid: string;
	category: string;
	count: string;
	countUnit: string;
	price: string;
	priceUnit: string;
	startDate: Date;
	endDate: Date;
}

async function getBilling(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const user = await getLoggedInUser(event);

	const unauthorizedResponse = {
		statusCode: 400,
		body: JSON.stringify({
			success: false,
			message: 'You do not have access to this area',
		})
	};

	if (
		!user ||
		(
			!user.isAdmin &&
			!user.isDistrictAdmin
		)
	) {
		return unauthorizedResponse;
	}

	const account = event.queryStringParameters?.account;
	if (
		typeof account === 'undefined' &&
		!user.isDistrictAdmin
	) {
		return unauthorizedResponse;
	}

	if (
		typeof account !== 'undefined' &&
		(
			typeof account !== 'string' ||
			![
				'Baca', 'NSCAD', 'Crestone', 'Saguache',
			].includes(account)
		)
	) {
		return {
			statusCode: 400,
			body: JSON.stringify({
				success: false,
				message: 'Invalid account to access',
			})
		};
	}

	const twilioSecret = await getTwilioSecret();
	const accountSid = twilioSecret[`accountSid${account || ''}`];
	const authToken = twilioSecret[`authToken${account || ''}`];
	if (
		typeof accountSid === 'undefined' ||
		typeof authToken === 'undefined'
	) {
		return {
			statusCode: 400,
			body: JSON.stringify({
				success: false,
				message: 'Unable to find authentication information for that account',
			})
		};
	}
	const twilioData: TwilioUsageItem[] = await new Promise((res, rej) => {
		require('twilio')(accountSid, authToken).api.v2010.account.usage.records
			.list({
				limit: 1000,
				includeSubaccounts: true,
				startDate: '-30days',
			}, (err: any, items: TwilioUsageItem[]) => err ? rej(err) : res(items));
	});

	return {
		statusCode: 200,
		body: JSON.stringify({
			success: true,
			data: twilioData
				.filter(item => Number(item.price) > 0)
				.map(item => ({
					cat: item.category,
					price: Number(item.price),
					priceUnit: item.priceUnit,
					count: Number(item.count),
					countUnit: item.countUnit,
				}))
		})
	}
}

export async function main(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.debug('main', ...arguments);
	const action = event.queryStringParameters?.action || 'none';

	try {
		switch (action) {
			case 'text':
				return await handleText(event);
			case 'textStatus':
				return await handleTextStatus(event);
			case 'voice':
				return await handleVoice(event);
			case 'billing':
				return await getBilling(event);
		}

		logger.error('main', 'Invalid Action', action);
		return {
			statusCode: 404,
			headers: {},
			body: JSON.stringify({
				error: true,
				message: `Invalid action '${action}'`
			})
		};
	} catch (e) {
		await incrementMetric('Error', {
			source: metricSource,
			type: 'Thrown error'
		});
		logger.error('main', e);
		return {
			statusCode: 400,
			headers: {},
			body: JSON.stringify({
				error: true,
				message: (e as Error).message
			})
		};
	}
}
