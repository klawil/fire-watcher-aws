import * as aws from 'aws-sdk';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getTwilioSecret, incrementMetric, parsePhone } from '../utils/general';
import { TwilioBody, TwilioErrorBody } from '../types/queue';
import { UserDepartment } from '../../common/userConstants';

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

	// Validate the sending number
	const eventData = event.body?.split('&')
		.map(str => str.split('=').map(str => decodeURIComponent(str)))
		.reduce((acc, curr) => ({
			...acc,
			[curr[0]]: curr[1] || ''
		}), {}) as TwilioTextEvent;
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
		!sender.Item.isActive?.BOOL ||
		sender.Item.pageOnly?.BOOL ||
		sender.Item.department?.S === 'Baca'
	) {
		response.body = `<Response><Message>You do not have access to use the text group. Contact your station chief to request access.</Message></Response>`
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
		console.log(`Invalid API code - ${code}`);
		await incrementMetric('Error', {
			source: metricSource,
			type: 'Invalid Twilio code'
		});
	} else if (messageId === null) {
		console.log(`Invalid message ID - ${messageId}`);
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
							name: `${result.Attributes?.fName?.S} ${result.Attributes?.lName?.S} (${result.Attributes?.callSign?.N})`,
							number: parsePhone(result.Attributes?.phone?.N || '', true),
							department: result.Attributes?.department?.S as UserDepartment,
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
					console.error(`Error with metrics`);
					console.error(e);
				}));
		}

		await Promise.all(promises);
	}

	return response;
}

async function handleVoice(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
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
		!sender.Item.isActive?.BOOL ||
		sender.Item.pageOnly?.BOOL ||
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
			':cs': sender.Item.callSign,
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
				statusCallback="https://fire.klawil.net/api/conference?action=join&amp;code=${encodeURIComponent(twilioConf.apiCode)}"
				statusCallbackEvents="start end join leave mute">
			${sender.Item.department.S}</Conference>
		</Dial>
	</Response>`;

	return response;
}

export async function main(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const action = event.queryStringParameters?.action || 'none';

	try {
		switch (action) {
			case 'text':
				return await handleText(event);
			case 'textStatus':
				return await handleTextStatus(event);
			case 'voice':
				return await handleVoice(event);
		}

		console.error(`Invalid action - '${action}'`);
		return {
			statusCode: 404,
			headers: {},
			body: JSON.stringify({
				error: true,
				message: `Invalid action '${action}'`
			})
		};
	} catch (e) {
		console.error(e);
		await incrementMetric('Error', {
			source: metricSource,
			type: 'Thrown error'
		});
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
