import * as aws from 'aws-sdk';
import * as crypto from 'crypto';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { incrementMetric, parseDynamoDbAttributeMap, parseDynamoDbAttributeValue, randomString, validateBodyIsJson } from '../utils/general';
import { allUserCookies, authTokenCookie, authUserCookie, getCookies, getLoggedInUser } from '../utils/auth';
import { Fido2Lib, ExpectedAssertionResult } from 'fido2-lib';
import { ApiUserAuthResponse, ApiUserFidoAuthBody, ApiUserFidoChallengeResponse, ApiUserFidoGetAuthResponse, ApiUserFidoRegisterBody, ApiUserGetUserResponse, ApiUserLoginResult } from '../../common/userApi';
import { unauthorizedApiResponse } from '../../common/common';

const metricSource = 'User';
const loginDuration = 60 * 60 * 24 * 31; // Logins last 31 days

const dynamodb = new aws.DynamoDB();
const sqs = new aws.SQS();

const queueUrl = process.env.QUEUE_URL as string;
const userTable = process.env.TABLE_USER as string;

const validDepartments: string[] = [
	'Crestone',
	'Moffat',
	'Saguache',
	'Villa Grove',
	'Baca',
	'NSCAD',
	'Center',
];
const validTalkgroups: string[] = [
	'8198',
	'8332',
	'8334',
	'8281',
	'18331',
	'18332',
	'8181',
];

interface ApiResponse {
	success: boolean;
	errors: string[];
	message?: string;
	data?: any[];
}

interface FidoKey {
	prevCount: number;
	pubKey: string;
	rawId: string;
}

interface FidoKeys {
	[key: string]: FidoKey;
};

interface UserObject {
	phone: string;
	fName: string;
	lName: string;
	callSign: string;
	isActive: boolean;
	isAdmin: boolean;
	talkgroups: string[];
	department?: string;
	pageOnly?: boolean;
	getTranscript?: boolean;
	getApiAlerts?: boolean;
	getVhfAlerts?: boolean;
	getDtrAlerts?: boolean;

	isMe?: boolean;
}

async function loginUser(user: AWS.DynamoDB.AttributeMap) {
	// Find the previous tokens that should be deleted
	const now = Date.now();
	const validUserTokens = user.loginTokens?.L
		?.filter(token => parseInt(token.M?.tokenExpiry?.N || '0') > now) || [];

	// Create a new token and attach it
	const token = randomString(32);
	const tokenExpiry = Date.now() + (loginDuration * 1000);
	validUserTokens.push({
		M: {
			token: { S: token },
			tokenExpiry: { N: tokenExpiry.toString() }
		}
	});
	await dynamodb.updateItem({
		TableName: userTable,
		Key: {
			phone: { N: user.phone?.N }
		},
		ExpressionAttributeNames: {
			'#c': 'code',
			'#ce': 'codeExpiry',
			'#t': 'loginTokens',
		},
		ExpressionAttributeValues: {
			':t': { L: validUserTokens },
		},
		UpdateExpression: 'REMOVE #c, #ce SET #t = :t'
	}).promise();

	return {
		'Set-Cookie': [
			`${authUserCookie}=${user.phone.N}; Secure; SameSite=None; Path=/; Max-Age=${loginDuration}`,
			`${authTokenCookie}=${token}; Secure; SameSite=None; Path=/; Max-Age=${loginDuration}`,
			`cvfd-user-name=${user.fName.S}; Secure; SameSite=None; Path=/; Max-Age=${loginDuration}`,
			`cvfd-user-admin=${user.isAdmin.BOOL ? '1' : '0'}; Secure; SameSite=None; Path=/; Max-Age=${loginDuration}`,
			`cvfd-user-super=${user.isDistrictAdmin.BOOL ? '1' : '0'}; Secure; SameSite=None; Path=/; Max-Age=${loginDuration}`,
		],
	};
}

async function handleLogin(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	// Validate the body
	validateBodyIsJson(event.body);

	// Parse the body
	const body = JSON.parse(event.body as string);
	const response: ApiUserLoginResult = {
		success: true,
		errors: []
	};

	// Validate the phone number
	let user: aws.DynamoDB.GetItemOutput | undefined;
	if (typeof body.phone === 'undefined') {
		response.success = false;
		response.errors.push('phone');
	} else {
		user = await dynamodb.getItem({
			TableName: userTable,
			Key: {
				phone: { N: body.phone }
			}
		}).promise();
		if (!user.Item) {
			response.success = false;
			response.errors.push('phone');
		}
	}
	if (!response.success) {
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	await sqs.sendMessage({
		MessageBody: JSON.stringify({
			action: 'login',
			phone: body.phone
		}),
		QueueUrl: queueUrl
	}).promise();

	const fidoKeys = parseDynamoDbAttributeValue(user?.Item?.fidoKeys || {}) as FidoKeys;
	if (Object.keys(fidoKeys).length > 0) {
		response.data = Object.keys(fidoKeys).map(key => fidoKeys[key].rawId);
	}

	return {
		statusCode: 200,
		body: JSON.stringify(response),
		headers: {
			'Set-Cookie': `${authUserCookie}=${body.phone}; SameSite=Strict; Path=/; Max-Age=${loginDuration}`
		}
	};
}

async function handleAuth(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	// Validate the body
	validateBodyIsJson(event.body);

	// Parse the body
	const body = JSON.parse(event.body as string);
	const response: ApiUserAuthResponse = {
		success: true,
		errors: []
	};

	const cookies = getCookies(event);

	// Validate the phone number
	if (typeof cookies[authUserCookie] === 'undefined') {
		response.success = false;
		response.errors.push('phone');
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}
	let user: aws.DynamoDB.GetItemOutput = await dynamodb.getItem({
		TableName: userTable,
		Key: {
			phone: { N: cookies[authUserCookie] }
		}
	}).promise();
	if (!user.Item) {
		response.success = false;
		response.errors.push('phone');
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	// Validate the code
	if (
		typeof body.code === 'undefined' ||
		body.code !== user.Item.code?.S ||
		Date.now() > parseInt(user.Item.codeExpiry?.N || '0')
	) {
		response.success = false;
		response.errors.push('code');
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	const headers = await loginUser(user.Item);
	return {
		statusCode: 200,
		body: JSON.stringify(response),
		multiValueHeaders: headers,
	};
}

async function getUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const user = await getLoggedInUser(event);
	const response: ApiUserGetUserResponse = {
		success: true,
		isUser: false,
		isActive: false,
		isAdmin: false,
		isDistrictAdmin: false
	};

	const httpResponse: APIGatewayProxyResult = {
		statusCode: 200,
		body: '',
	};

	if (user !== null) {
		response.isUser = true;
		response.isActive = !!user.isActive?.BOOL;
		response.isAdmin = !!user.isAdmin?.BOOL && !!user.isActive?.BOOL;
		response.isDistrictAdmin = !!user.isDistrictAdmin?.BOOL;
		response.phone = user.phone?.N;
		response.callSign = user.callSign?.N;
		response.fName = user.fName?.S;
		response.lName = user.lName?.S;
		response.department = user.department?.S;
		response.talkgroups = user.talkgroups?.NS;
		if (typeof user.fidoKeys !== 'undefined') {
			const fidoKeys = parseDynamoDbAttributeValue(user.fidoKeys) as FidoKeys;
			response.fidoKeys = Object.keys(fidoKeys).reduce((agg: {[key: string]: string }, key) => {
				agg[key] = fidoKeys[key].rawId;
				return agg;
			}, {});
		}

		// Get the request cookies
		const cookies = getCookies(event);
		const cookieMap: { [key: string]: string } = {
			'cvfd-user-name': response.fName as string,
			'cvfd-user-admin': response.isAdmin ? '1' : '0',
			'cvfd-user-super': response.isDistrictAdmin ? '1' : '0',
		};
		const cookieValues: string[] = [];
		Object.keys(cookieMap).forEach(cookie => {
			if (typeof cookies[cookie] === 'undefined') {
				cookieValues.push(`${cookie}=${cookieMap[cookie]}; Secure; SameSite=None; Path=/; Max-Age=${loginDuration}`);
			}
		});
		if (cookieValues.length > 0) {
			httpResponse.multiValueHeaders = {
				'Set-Cookie': cookieValues,
			};
		}

		// Save now as the last login time
		await dynamodb.updateItem({
			TableName: userTable,
			Key: {
				phone: {
					N: user.phone.N,
				},
			},
			ExpressionAttributeNames: {
				'#lli': 'lastLogin',
			},
			ExpressionAttributeValues: {
				':lli': {
					N: Date.now().toString(),
				},
			},
			UpdateExpression: 'SET #lli = :lli',
		}).promise();
	}

	httpResponse.body = JSON.stringify(response);
	return httpResponse;
}

async function handleLogout(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	let redirectLocation = '/';
	if (event.queryStringParameters?.redirectTo) {
		redirectLocation = event.queryStringParameters.redirectTo;
	}

	const response: APIGatewayProxyResult = {
		statusCode: 302,
		body: 'Logged Out',
		multiValueHeaders: {
			'Set-Cookie': allUserCookies.map(v => `${v}=; Path=/; Max-Age=0`),
		},
		headers: {
			Location: redirectLocation
		}
	};

	// Validate the tokens
	const user = await getLoggedInUser(event);
	if (user === null)
		return response;

	// Delete the needed tokens
	const loginToken = getCookies(event)[authTokenCookie];
	const now = Date.now();
	const validUserTokens = user.loginTokens?.L
		?.filter(token => token.M?.token?.S !== loginToken)
		.filter(token => parseInt(token.M?.tokenExpiry?.N || '0', 10) > now);
	const updateConfig: aws.DynamoDB.UpdateItemInput = {
		TableName: userTable,
		Key: {
			phone: { N: user.phone?.N }
		},
		ExpressionAttributeNames: {
			'#t': 'loginTokens'
		},
		ExpressionAttributeValues: {
			':t': { L: validUserTokens }
		},
		UpdateExpression: 'SET #t = :t'
	};
	if (
		typeof validUserTokens === 'undefined' ||
		validUserTokens.length === 0
	) {
		delete updateConfig.ExpressionAttributeValues;
		updateConfig.UpdateExpression = 'REMOVE #t';
	}
	await dynamodb.updateItem(updateConfig).promise();

	return response;
}

async function handleList(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const user = await getLoggedInUser(event);
	const unauthorizedResponse = {
		statusCode: 403,
		body: JSON.stringify({
			success: false,
			message: 'You are not permitted to access this area'
		})
	};
	if (
		user === null ||
		!user.isAdmin?.BOOL
	) {
		return unauthorizedResponse;
	}

	// Get the users to return
	let usersItems: aws.DynamoDB.ScanOutput | aws.DynamoDB.QueryOutput;
	if (user.isDistrictAdmin?.BOOL) {
		usersItems = await dynamodb.scan({
			TableName: userTable,
			ExpressionAttributeNames: {
				'#fn': 'fName',
				'#ln': 'lName',
				'#d': 'department',
				'#p': 'phone',
				'#cs': 'callSign',
				'#active': 'isActive',
				'#admin': 'isAdmin',
				'#tg': 'talkgroups',
				'#po': 'pageOnly',
				'#gt': 'getTranscript',
				'#gaa': 'getApiAlerts',
				'#gva': 'getVhfAlerts',
				'#gda': 'getDtrAlerts',
				'#lli': 'lastLogin',
			},
			ProjectionExpression: '#fn,#ln,#d,#p,#cs,#active,#admin,#tg,#po,#gt,#gaa,#gva,#gda,#lli'
		}).promise();
	} else {
		usersItems = await dynamodb.query({
			TableName: userTable,
			IndexName: 'StationIndex',
			ExpressionAttributeNames: {
				'#d': 'department',
				'#fn': 'fName',
				'#ln': 'lName',
				'#p': 'phone',
				'#cs': 'callSign',
				'#active': 'isActive',
				'#admin': 'isAdmin',
				'#tg': 'talkgroups',
				'#lli': 'lastLogin',
			},
			ExpressionAttributeValues: {
				':d': { S: user.department?.S }
			},
			KeyConditionExpression: '#d = :d',
			ProjectionExpression: '#fn,#ln,#p,#cs,#active,#admin,#tg,#lli'
		}).promise();
	}

	if (usersItems.Items)
		usersItems.Items = usersItems.Items.sort((a, b) => Number(a.callSign?.N || 0) > Number(b.callSign?.N || 0)
			? 1
			: -1);

	// Parse the users into a readable format
	const users = (usersItems.Items || [])
		.map(parseDynamoDbAttributeMap);

	return {
		statusCode: 200,
		body: JSON.stringify({
			success: true,
			users
		})
	};
}

async function createOrUpdateUser(event: APIGatewayProxyEvent, create: boolean): Promise<APIGatewayProxyResult> {
	const user = await getLoggedInUser(event);
	const unauthorizedResponse = {
		statusCode: 403,
		body: JSON.stringify({
			success: false,
			message: 'You are not permitted to access this area'
		})
	};
	if (user === null) {
		return unauthorizedResponse;
	}

	// Validate and parse the body
	validateBodyIsJson(event.body);
	const body = JSON.parse(event.body as string) as UserObject;
	const response: ApiResponse = {
		success: true,
		errors: []
	};
	if (body.isMe) {
		user.isAdmin = { BOOL: false };
		user.isDistrictAdmin = { BOOL: false };
	}

	// Validate the person has the right permissions
	if (
		(
			!user.isAdmin?.BOOL ||
			!user.isActive?.BOOL
		 ) &&
		user.phone.N !== body.phone
	) {
		return unauthorizedResponse;
	}

	// Validate the request
	if (
		typeof body.phone !== 'string' ||
		body.phone.replace(/[^0-9]/g, '').length !== 10
	) {
		response.errors.push('phone');
	} else {
		body.phone = body.phone.replace(/[^0-9]/g, '');
	}
	if (
		typeof body.fName !== 'string' ||
		body.fName.length === 0
	) {
		response.errors.push('fName');
	}
	if (
		typeof body.lName !== 'string' ||
		body.lName.length === 0
	) {
		response.errors.push('lName');
	}
	if (
		typeof body.talkgroups === 'undefined' ||
		!Array.isArray(body.talkgroups) ||
		body.talkgroups.filter(v => validTalkgroups.indexOf(v) !== -1).length === 0
	) {
		response.errors.push('talkgroups');
	}
	if (user.isAdmin?.BOOL) {
		if (
			typeof body.callSign !== 'string' ||
			!/^[0-9]+$/.test(body.callSign)
		) {
			response.errors.push('callSign');
		}
		if (typeof body.isActive !== 'boolean') {
			response.errors.push('isActive');
		}
		if (typeof body.isAdmin !== 'boolean') {
			response.errors.push('isAdmin');
		}
	}
	if (user.isDistrictAdmin?.BOOL) {
		if (typeof body.pageOnly !== 'boolean') {
			response.errors.push('pageOnly');
		}
		if (typeof body.getTranscript !== 'boolean') {
			response.errors.push('getTranscript');
		}
		if (typeof body.getApiAlerts !== 'boolean') {
			response.errors.push('getApiAlerts');
		}
		if (typeof body.getVhfAlerts !== 'boolean') {
			response.errors.push('getVhfAlerts');
		}
		if (typeof body.getDtrAlerts !== 'boolean') {
			response.errors.push('getDtrAlerts');
		}
		if (
			typeof body.department !== 'undefined' &&
			validDepartments.indexOf(body.department) === -1
		) {
			response.errors.push('department');
		}
	}

	// Check to see if the phone number already exists
	let newPhone: aws.DynamoDB.GetItemOutput | undefined;
	if (response.errors.length === 0) {
		newPhone = await dynamodb.getItem({
			TableName: userTable,
			Key: {
				phone: { N: body.phone }
			}
		}).promise();
		if (
			(newPhone.Item && create) ||
			(!newPhone.Item && !create)
		) {
			response.errors.push('phone');
		}
	}

	// Check to see if someone is trying to edit a person from another department
	if (
		!body.isMe &&
		newPhone &&
		!create &&
		newPhone.Item &&
		newPhone.Item.department?.S !== body.department &&
		!user.isDistrictAdmin?.BOOL
	) {
		response.errors.push('phone');
	}

	if (response.errors.length > 0) {
		response.success = false;
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}
	
	// Create the user
	const updateConfig: aws.DynamoDB.UpdateItemInput = {
		TableName: userTable,
		Key: {
			phone: { N: body.phone }
		},
		ExpressionAttributeNames: {
			'#fn': 'fName',
			'#ln': 'lName',
			'#tg': 'talkgroups'
		},
		ExpressionAttributeValues: {
			':fn': { S: body.fName },
			':ln': { S: body.lName },
			':tg': { NS: body.talkgroups }
		},
		UpdateExpression: 'SET #fn = :fn, #ln = :ln, #tg = :tg',
		ReturnValues: 'UPDATED_NEW'
	};
	if (user.isAdmin?.BOOL) {
		updateConfig.ExpressionAttributeNames = updateConfig.ExpressionAttributeNames || {};
		updateConfig.ExpressionAttributeValues = updateConfig.ExpressionAttributeValues || {};

		updateConfig.ExpressionAttributeNames['#cs'] = 'callSign';
		updateConfig.ExpressionAttributeNames['#act'] = 'isActive';
		updateConfig.ExpressionAttributeNames['#adm'] = 'isAdmin';

		updateConfig.ExpressionAttributeValues[':cs'] = { N: body.callSign };
		updateConfig.ExpressionAttributeValues[':act'] = { BOOL: body.isActive };
		updateConfig.ExpressionAttributeValues[':adm'] = { BOOL: body.isAdmin };

		updateConfig.UpdateExpression += `, #cs = :cs, #act = :act, #adm = :adm`;
	}
	if (user.isDistrictAdmin?.BOOL) {
		updateConfig.ExpressionAttributeNames = updateConfig.ExpressionAttributeNames || {};
		updateConfig.ExpressionAttributeValues = updateConfig.ExpressionAttributeValues || {};

		updateConfig.ExpressionAttributeNames['#dep'] = 'department';
		updateConfig.ExpressionAttributeNames['#po'] = 'pageOnly';
		updateConfig.ExpressionAttributeNames['#gt'] = 'getTranscript';
		updateConfig.ExpressionAttributeNames['#gaa'] = 'getApiAlerts';
		updateConfig.ExpressionAttributeNames['#gva'] = 'getVhfAlerts';
		updateConfig.ExpressionAttributeNames['#gda'] = 'getDtrAlerts';

		updateConfig.ExpressionAttributeValues[':dep'] = { S: body.department };
		updateConfig.ExpressionAttributeValues[':po'] = { BOOL: body.pageOnly };
		updateConfig.ExpressionAttributeValues[':gt'] = { BOOL: body.getTranscript };
		updateConfig.ExpressionAttributeValues[':gaa'] = { BOOL: body.getApiAlerts };
		updateConfig.ExpressionAttributeValues[':gva'] = { BOOL: body.getVhfAlerts };
		updateConfig.ExpressionAttributeValues[':gda'] = { BOOL: body.getDtrAlerts };

		updateConfig.UpdateExpression += `, #dep = :dep, #po = :po, #gt = :gt, #gaa = :gaa, #gva = :gva, #gda = :gda`;
	} else {
		updateConfig.ExpressionAttributeNames = updateConfig.ExpressionAttributeNames || {};
		updateConfig.ExpressionAttributeValues = updateConfig.ExpressionAttributeValues || {};

		updateConfig.ExpressionAttributeNames['#dep'] = 'department';

		updateConfig.ExpressionAttributeValues[':dep'] = { S: user.department?.S };

		updateConfig.UpdateExpression += `, #dep = :dep`;
	}
	const result = await dynamodb.updateItem(updateConfig).promise();
	if (!result.Attributes) {
		response.success = false;
	} else if (
		body.isActive &&
		(
			!newPhone ||
			!newPhone.Item?.isActive?.BOOL
		)
	) {
		await sqs.sendMessage({
			MessageBody: JSON.stringify({
				action: 'activate',
				phone: body.phone
			}),
			QueueUrl: queueUrl
		}).promise();
	}

	return {
		statusCode: response.success ? 200 : 400,
		body: JSON.stringify(response)
	};
}

async function deleteUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const user = await getLoggedInUser(event);
	const unauthorizedResponse = {
		statusCode: 403,
		body: JSON.stringify({
			success: false,
			message: 'You are not permitted to access this area'
		})
	};
	if (
		user === null ||
		!user.isAdmin?.BOOL ||
		!user.isActive?.BOOL
	) {
		return unauthorizedResponse;
	}

	// Validate and parse the body
	validateBodyIsJson(event.body);
	const body = JSON.parse(event.body as string) as UserObject;
	const response: ApiResponse = {
		success: true,
		errors: []
	};

	// Validate the request
	if (
		typeof body.phone !== 'string' ||
		body.phone.replace(/[^0-9]/g, '').length !== 10
	) {
		response.errors.push('phone');
	} else {
		body.phone = body.phone.replace(/[^0-9]/g, '');
	}
	if (response.errors.length > 0) {
		response.success = false;
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	// Delete the user
	const result = await dynamodb.deleteItem({
		TableName: userTable,
		Key: {
			phone: { N: body.phone }
		}
	}).promise();

	response.data = [ result ];
	return {
		statusCode: 200,
		body: JSON.stringify(response)
	};
}

function getFidoLib() {
	return new Fido2Lib({
		timeout: 60,
		rpId: 'fire.klawil.net',
		rpName: 'CVFD DTR',
		challengeSize: 128,
	});
}

function base64ToBuffer(base64: string): Buffer {
	return Buffer.from(base64, 'base64');
}

function bufferToBase64(buffer: ArrayBuffer): string {
	return Buffer.from(buffer).toString('base64');
}

async function fidoGetChallenge(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const user = await getLoggedInUser(event);
	if (user === null)
		return unauthorizedApiResponse;

	// Validate and parse the body
	validateBodyIsJson(event.body);
	const body = JSON.parse(event.body as string) as {
		name: string;
	};
	if (
		typeof user.fidoKeys?.M !== 'undefined' &&
		typeof user.fidoKeys.M[body.name] !== 'undefined'
	) {
		return {
			statusCode: 400,
			body: JSON.stringify({
				success: false,
				message: 'A key with that name already exists',
			}),
		};
	}

	const f2l = getFidoLib();

	const options = await f2l.attestationOptions();

	const userId = typeof user.fidoUserId?.S !== 'undefined'
		? base64ToBuffer(user.fidoUserId.S)
		: crypto.randomBytes(32);

	const response: ApiUserFidoChallengeResponse = {
		success: true,
		options: {
			challenge: bufferToBase64(options.challenge),
			rp: options.rp,
			user: {
				name: user.phone?.N as string,
				displayName: `${user.fName?.S} ${user.lName?.S}`,
				id: bufferToBase64(userId),
			},
			pubKeyCredParams: options.pubKeyCredParams,
			timeout: options.timeout,
			attestation: options.attestation,
		},
	};
	return {
		statusCode: 200,
		body: JSON.stringify(response),
	};
}

async function fidoRegister(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const user = await getLoggedInUser(event);
	if (user === null)
		return unauthorizedApiResponse;

	// Validate and parse the body
	validateBodyIsJson(event.body);
	const body = JSON.parse(event.body as string) as ApiUserFidoRegisterBody;
	const { credential } = body;
	const f2l = getFidoLib();
	const result = {
		rawId: base64ToBuffer(credential.rawId),
		// rawId: new Uint8Array(Buffer.from(credential.rawId, 'base64')).buffer,
		response: credential.response,
	};
	try {
		const regResult = await f2l.attestationResult(result, {
			challenge: body.challenge,
			origin: 'https://fire.klawil.net',
			factor: 'either',
		});

		const newFidoKey = {
			M: {
				pubKey: { S: regResult.authnrData.get('credentialPublicKeyPem') },
				prevCount: { N: regResult.authnrData.get('counter').toString() },
				rawId: { S: credential.rawId },
			},
		};
		if (typeof user.fidoKeys?.M !== 'undefined') {
			// Add to keys
			await dynamodb.updateItem({
				TableName: userTable,
				Key: {
					phone: user.phone,
				},
				ExpressionAttributeNames: {
					'#fk': 'fidoKeys',
					'#fkn': body.name,
				},
				ExpressionAttributeValues: {
					':fkv': newFidoKey,
				},
				UpdateExpression: 'SET #fk.#fkn = :fkv',
			}).promise();
		} else {
			// Create keys
			await dynamodb.updateItem({
				TableName: userTable,
				Key: {
					phone: user.phone,
				},
				ExpressionAttributeNames: {
					'#fk': 'fidoKeys',
					'#uid': 'fidoUserId',
				},
				ExpressionAttributeValues: {
					':uid': {
						S: body.userId,
					},
					':fk': newFidoKey,
				},
				UpdateExpression: 'SET #fk = :fk, #uid = :uid',
			}).promise();
		}

		return {
			statusCode: 200,
			body: JSON.stringify({ success: true }),
		}
	} catch (e) {
		return {
			statusCode: 500,
			body: JSON.stringify({
				success: false,
				message: (e as Error).message,
			}),
		};
	}
}

async function fidoGetAuth(): Promise<APIGatewayProxyResult> {
	const f2l = getFidoLib();
	const options = await f2l.assertionOptions();
	const responseBody: ApiUserFidoGetAuthResponse = {
		success: true,
		challenge: bufferToBase64(options.challenge),
	};
	return {
		statusCode: 200,
		body: JSON.stringify(responseBody),
	};
}

async function fidoAuth(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	// Validate the body
	validateBodyIsJson(event.body);

	// Parse the body
	const body = JSON.parse(event.body as string) as ApiUserFidoAuthBody;

	// Get the user
	let user: AWS.DynamoDB.AttributeMap | null = null;
	if (body.test) {
		user = await getLoggedInUser(event);
	} else if (typeof body.phone !== 'undefined') {
		user = await dynamodb.getItem({
			TableName: userTable,
			Key: {
				phone: { N: body.phone }
			}
		}).promise().then(data => data.Item || null);
	}
	if (
		user === null ||
		typeof user.fidoKeys?.M === 'undefined'
	) {
		return {
			statusCode: 400,
			body: JSON.stringify({
				success: false,
				message: 'Invalid user',
			}),
		};
	}

	// Get the correct key
	const fidoKeys = parseDynamoDbAttributeValue(user.fidoKeys) as FidoKeys;
	let fidoKey: FidoKey | undefined;
	Object.keys(fidoKeys).forEach(key => {
		if (fidoKeys[key].rawId === body.rawId) {
			fidoKey = fidoKeys[key] as FidoKey;
		}
	});
	if (!fidoKey) {
		return {
			statusCode: 400,
			body: JSON.stringify({
				success: false,
				message: 'Invalid Key',
			}),
		};
	}

	const assertionExpectations: ExpectedAssertionResult = {
		challenge: body.challenge,
		origin: 'https://fire.klawil.net',
		factor: 'either',
		publicKey: fidoKey.pubKey,
		prevCounter: fidoKey.prevCount,
		userHandle: user.fidoUserId?.S as string,
		// userHandle: null,
	};
	const f2l = getFidoLib();

	try {
		await f2l.assertionResult({
			...body,
			response: {
				...body.response,
				authenticatorData: new Uint8Array(base64ToBuffer(body.response.authenticatorData)).buffer,
			},
			rawId: new Uint8Array(base64ToBuffer(body.rawId)).buffer,
		}, assertionExpectations);
	} catch (e) {
		return {
			statusCode: 500,
			body: JSON.stringify({
				success: false,
				message: (e as Error).message,
			})
		}
	}

	if (body.test) {
		return {
			statusCode: 200,
			body: JSON.stringify({ success: true }),
		};
	}

	const headers = await loginUser(user);
	return {
		statusCode: 200,
		body: JSON.stringify({ success: true }),
		multiValueHeaders: headers,
	};
}

export async function main(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const action = event.queryStringParameters?.action || 'none';
	try {
		switch (action) {
			case 'login':
				return await handleLogin(event);
			case 'auth':
				return await handleAuth(event);
			case 'getUser':
				return await getUser(event);
			case 'logout':
				return await handleLogout(event);
			case 'list':
				return await handleList(event);
			case 'create':
				return await createOrUpdateUser(event, true);
			case 'update':
				return await createOrUpdateUser(event, false);
			case 'delete':
				return await deleteUser(event);
			case 'fido-challenge':
				return await fidoGetChallenge(event);
			case 'fido-register':
				return await fidoRegister(event);
			case 'fido-get-auth':
				return await fidoGetAuth();
			case 'fido-auth':
				return await fidoAuth(event);
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
		await incrementMetric('Error', {
			source: metricSource,
			type: 'Thrown error'
		});
		console.error(e);
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
