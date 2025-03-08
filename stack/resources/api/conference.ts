import * as aws from 'aws-sdk';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getLoggedInUser } from '../utils/auth';
import { getTwilioSecret, incrementMetric, parseDynamoDbAttributeMap } from '../utils/general';
import { ApiConferenceEndResponse, ApiConferenceGetResponse, ApiConferenceInviteResponse, ApiConferenceKickUserResponse, ApiConferenceTokenResponse, ConferenceAttendeeObject } from '../../../common/conferenceApi';
import { unauthorizedApiResponse } from '../types/api';
import { defaultDepartment, departmentConfig } from '../../../common/userConstants';

const metricSource = 'Conference';

const dynamodb = new aws.DynamoDB();

const userTable = process.env.TABLE_USER as string;
const conferenceTable = process.env.TABLE_CONFERENCE as string;

async function getToken(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const user = await getLoggedInUser(event);
	if (
		user === null ||
		!user.isActive?.BOOL
	) {
		return unauthorizedApiResponse;
	}

	const twilioConf = await getTwilioSecret();

	const AccessToken = require('twilio').jwt.AccessToken;
	const voiceGrant = new AccessToken.VoiceGrant({
		outgoingApplicationSid: twilioConf.voiceOutgoingSid,
	});

	const token = new AccessToken(
		twilioConf.accountSid,
		twilioConf.voiceApiSid,
		twilioConf.voiceApiSecret,
		{ identity: 'user', ttl: 15 * 60 }
	);
	token.addGrant(voiceGrant);

	const responseBody: ApiConferenceTokenResponse = {
		success: true,
		token: token.toJwt(),
	};
	return {
		statusCode: 200,
		body: JSON.stringify(responseBody),
	};
}

interface TwilioConferenceEvent {
	ConferenceSid: string;
	FriendlyName: string;
	AccountSid: string;
	StatusCallbackEvent?: string;
	CallSid?: string;
}

async function handleJoin(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const code = event.queryStringParameters?.code;
	const response: APIGatewayProxyResult = {
		statusCode: 204,
		body: ''
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

	// Parse the event data
	const eventData = event.body?.split('&')
		.map(str => str.split('=').map(str => decodeURIComponent(str)))
		.reduce((acc, curr) => ({
			...acc,
			[curr[0]]: curr[1] || ''
		}), {}) as TwilioConferenceEvent;

	let doUpdate: boolean = false;
	switch (eventData.StatusCallbackEvent) {
		case 'participant-join':
			doUpdate = true;
			await dynamodb.updateItem({
				TableName: conferenceTable,
				Key: {
					CallSid: {
						S: eventData.CallSid,
					},
				},
				ExpressionAttributeNames: {
					'#cid': 'ConferenceSid',
				},
				ExpressionAttributeValues: {
					':cid': {
						S: eventData.ConferenceSid,
					},
				},
				UpdateExpression: 'SET #cid = :cid',
			}).promise();
			break;
		case 'participant-leave':
			doUpdate = true;
			await dynamodb.deleteItem({
				TableName: conferenceTable,
				Key: {
					CallSid: {
						S: eventData.CallSid,
					},
				},
			}).promise();
			break;
	}
	
	if (doUpdate)
		await dynamodb.query({
			TableName: conferenceTable,
			IndexName: 'Conference',
			ExpressionAttributeNames: {
				'#conf': 'ConferenceSid',
			},
			ExpressionAttributeValues: {
				':conf': { S: eventData.ConferenceSid },
			},
			KeyConditionExpression: '#conf = :conf',
		}).promise()
			.then(result => result.Items)
			.then(items => {
				if (!items || items.length === 0) return;

				const parsedItems = items.map(parseDynamoDbAttributeMap);

				const sendParticipantsTo = parsedItems.filter(call => call.Type === 'Browser');
				if (sendParticipantsTo.length === 0) return;

				const twilio = require('twilio')(twilioConf.accountSid, twilioConf.authToken);
				return Promise.all(sendParticipantsTo.map(call => {
					return twilio.calls(call.CallSid)
						.userDefinedMessages
						.create({ content: JSON.stringify({
							participants: parsedItems,
							you: call.CallSid,
						}) })
						.catch(console.error);
				}));
			});

	return response;
}

async function handleKickUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const user = await getLoggedInUser(event);
	if (
		user === null ||
		!user.isAdmin?.BOOL
	) {
		return unauthorizedApiResponse;
	}

	// Validate the call SID
	if (typeof event.queryStringParameters?.callSid !== 'string') {
		const responseBody: ApiConferenceKickUserResponse = {
			success: false,
			message: 'Provide a `callSid`',
		};
		return {
			statusCode: 400,
			body: JSON.stringify(responseBody),
		};
	}

	const responseBody: ApiConferenceKickUserResponse = {
		success: true,
	};
	const response: APIGatewayProxyResult = {
		statusCode: 200,
		body: JSON.stringify(responseBody),
	};

	// Get the API config
	const twilioConfPromise = getTwilioSecret();

	// Get the conference info
	const conferenceCall = await dynamodb.query({
		TableName: conferenceTable,
		ExpressionAttributeNames: {
			'#call': 'CallSid',
		},
		ExpressionAttributeValues: {
			':call': { S: event.queryStringParameters.callSid },
		},
		KeyConditionExpression: '#call = :call',
	}).promise();

	if (!conferenceCall.Items || conferenceCall.Items.length !== 1) {
		const errorResponseBody: ApiConferenceKickUserResponse = {
			success: false,
			message: 'Invalid `callSid`',
		};
		return {
			statusCode: 400,
			body: JSON.stringify(errorResponseBody),
		};
	}
	const twilioConf = await twilioConfPromise;
	const conferenceItem = parseDynamoDbAttributeMap(conferenceCall.Items[0]);

	const twilioClient = require('twilio')(twilioConf.accountSid, twilioConf.authToken);
	await twilioClient.conferences(conferenceItem.ConferenceSid)
		.participants(conferenceItem.CallSid)
		.update({ hold: true });

	await twilioClient.calls(event.queryStringParameters.callSid)
		.update({ twiml: '<Response><Say>You have been removed from the call. Goodbye.</Say><Hangup></Hangup></Response>' });

	return response;
}

async function handleInvite(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const user = await getLoggedInUser(event);
	if (
		user === null ||
		!user.isAdmin?.BOOL
	) {
		return unauthorizedApiResponse;
	}

	const invalidPhoneResponseBody: ApiConferenceInviteResponse = {
		success: false,
		message: 'Provide a valid `phone`',
	};
	const invalidPhoneResponse = {
		statusCode: 400,
		body: JSON.stringify(invalidPhoneResponseBody),
	};
	if (
		typeof event.queryStringParameters?.phone !== 'string' ||
		!/^\d{10}$/.test(event.queryStringParameters.phone)
	) {
		return invalidPhoneResponse;
	}

	const userInfo = await dynamodb.query({
		TableName: userTable,
		ExpressionAttributeNames: {
			'#phone': 'phone',
		},
		ExpressionAttributeValues: {
			':phone': { N: event.queryStringParameters.phone },
		},
		KeyConditionExpression: '#phone = :phone',
	}).promise();
	if (!userInfo.Items || userInfo.Items.length !== 1) {
		return invalidPhoneResponse;
	}
	const invited = parseDynamoDbAttributeMap(userInfo.Items[0]);

	const twilioConf = await getTwilioSecret();
	const twilioClient = require('twilio')(twilioConf.accountSid, twilioConf.authToken);
	const callInfo = await twilioClient.calls.create({
		twiml: `<?xml version="1.0" encoding="UTF-8"?>
		<Response>
			<Say>Hello ${invited.fName}. ${user.fName.S} has invited you to join the ${invited.department} call. Adding you now.</Say>
			<Dial>
				<Conference
					participantLabel="${invited.fName} ${invited.lName} ${Math.round(Math.random() * 100)}"
					statusCallback="https://fire.klawil.net/api/conference?action=join&amp;code=${encodeURIComponent(twilioConf.apiCode)}"
					statusCallbackEvents="start end join leave mute">
				${invited.department}</Conference>
			</Dial>
		</Response>`,
		to: `+1${invited.phone}`,
		from: departmentConfig[defaultDepartment].pagingPhone,
	});

	await dynamodb.updateItem({
		TableName: conferenceTable,
		Key: {
			CallSid: { S: callInfo.sid },
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
			':cs': userInfo.Items[0].callSign,
			':fn': userInfo.Items[0].fName,
			':ln': userInfo.Items[0].lName,
			':p': userInfo.Items[0].phone,
			':t': { S: 'Phone' },
			':r': userInfo.Items[0].department,
		},
		UpdateExpression: 'SET #cs = :cs, #fn = :fn, #ln = :ln, #p = :p, #t = :t, #r = :r',
	}).promise();

	const responseBody: ApiConferenceInviteResponse = {
		success: true,
	};
	return {
		statusCode: 200,
		body: JSON.stringify(responseBody),
	};
}

async function getConference(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const user = await getLoggedInUser(event);
	if (
		user === null ||
		!user.isActive?.BOOL
	) {
		return unauthorizedApiResponse;
	}

	const activeUsers = await dynamodb.scan({
		TableName: conferenceTable,
		ExpressionAttributeNames: {
			'#r': 'Room',
		},
		ExpressionAttributeValues: {
			':r': { S: user.department?.S },
		},
		FilterExpression: '#r = :r',
	}).promise();

	const responseBody: ApiConferenceGetResponse = {
		success: true,
		data: activeUsers.Items?.map(parseDynamoDbAttributeMap)
			.map(item => item as unknown as ConferenceAttendeeObject)
			.filter(v => typeof v.ConferenceSid !== 'undefined'),
	}
	return {
		statusCode: 200,
		body: JSON.stringify(responseBody),
	};
}

async function endConference(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const user = await getLoggedInUser(event);
	if (
		user === null ||
		!user.isActive?.BOOL
	) {
		return unauthorizedApiResponse;
	}

	const activeUsers = await dynamodb.scan({
		TableName: conferenceTable,
		ExpressionAttributeNames: {
			'#r': 'Room',
		},
		ExpressionAttributeValues: {
			':r': { S: user.department?.S },
		},
		FilterExpression: '#r = :r',
	}).promise();

	const parsedActiveUser = activeUsers.Items?.filter(u => u.ConferenceSid?.S !== 'undefined') || [];
	if (parsedActiveUser.length > 0) {
		const twilioConf = await getTwilioSecret();
		await require('twilio')(twilioConf.accountSid, twilioConf.authToken)
			.conferences(parsedActiveUser[0].ConferenceSid.S)
			.update({ status: 'completed' });
	}

	const responseBody: ApiConferenceEndResponse = {
		success: true,
	};
	return {
		statusCode: 200,
		body: JSON.stringify(responseBody),
	};
}

export async function main(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const action = event.queryStringParameters?.action || 'none';

	try {
		switch (action) {
			case 'token':
				return await getToken(event);
			case 'join':
				return await handleJoin(event);
			case 'kickUser':
				return await handleKickUser(event);
			case 'invite':
				return await handleInvite(event);
			case 'get':
				return await getConference(event);
			case 'end':
				return await endConference(event);
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
