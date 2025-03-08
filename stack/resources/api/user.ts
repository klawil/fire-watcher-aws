import * as aws from 'aws-sdk';
import * as crypto from 'crypto';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { incrementMetric, randomString, validateBodyIsJson } from '../utils/general';
import { parseDynamoDbAttributeMap, parseDynamoDbAttributeValue } from '../utils/dynamodb';
import { getCookies, getLoggedInUser } from '../utils/auth';
import { allUserCookies, authTokenCookie, authUserCookie, isUserActive } from '../types/auth';
import { Fido2Lib, ExpectedAssertionResult } from 'fido2-lib';
import { ApiUserAuthResponse, ApiUserFidoAuthBody, ApiUserFidoChallengeResponse, ApiUserFidoGetAuthResponse, ApiUserFidoRegisterBody, ApiUserGetUserResponse, ApiUserListResponse, ApiUserLoginResult, ApiUserUpdateBody, ApiUserUpdateGroupBody, InternalUserObject, UserObject } from '../../../common/userApi';
import { unauthorizedApiResponse } from '../types/api';
import { PagingTalkgroup, pagingTalkgroupOrder, UserDepartment, validDepartments } from '../../../common/userConstants';
import { ActivateBody, LoginBody } from '../types/queue';
import { getLogger } from '../utils/logger';

const logger = getLogger('user');

const metricSource = 'User';
const loginDuration = 60 * 60 * 24 * 31; // Logins last 31 days

const dynamodb = new aws.DynamoDB();
const sqs = new aws.SQS();

const queueUrl = process.env.QUEUE_URL as string;
const userTable = process.env.TABLE_USER as string;

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

async function loginUser(user: InternalUserObject) {
	logger.trace('loginUser', ...arguments);
	// Find the previous tokens that should be deleted
	const now = Date.now();
	const validUserTokens = user.loginTokens
		?.filter(token => (token.tokenExpiry || 0) > now) || [];

	// Create a new token and attach it
	const token = randomString(32);
	const tokenExpiry = Date.now() + (loginDuration * 1000);
	validUserTokens.push({
		token,
		tokenExpiry,
	});
	await dynamodb.updateItem({
		TableName: userTable,
		Key: {
			phone: { N: user.phone.toString() }
		},
		ExpressionAttributeNames: {
			'#c': 'code',
			'#ce': 'codeExpiry',
			'#t': 'loginTokens',
		},
		ExpressionAttributeValues: {
			':t': { L: validUserTokens.map(tkn => ({
				M: {
					token: { S: tkn.token },
					tokenExpiry: { N: tkn.tokenExpiry.toString() },
				}
			})) },
		},
		UpdateExpression: 'REMOVE #c, #ce SET #t = :t'
	}).promise();
	
	const userCookies: string[] = [
		`${authUserCookie}=${user.phone}`,
		`${authTokenCookie}=${token}`,
		`cvfd-user-name=${user.fName}`,
		`cvfd-user-admin=${user.isAdmin ? '1' : '0'}`,
		`cvfd-user-super=${user.isDistrictAdmin ? '1' : '0'}`,
	];
	validDepartments.map(dep => {
		if (typeof user[dep] === 'undefined') return;

		const value = JSON.stringify(user[dep] || {});
		userCookies.push(`cvfd-user-${dep}=${value}`);
	});

	return {
		'Set-Cookie': userCookies.map(c => `${c}; Secure; SameSite=None; Path=/; Max-Age=${loginDuration}`),
	};
}

async function handleLogin(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.trace('handleLogin', ...arguments);
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
		if (
			!user.Item ||
			!isUserActive(user.Item)
		) {
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

	const queueMessage: LoginBody = {
		action: 'login',
		phone: body.phone,
	};
	await sqs.sendMessage({
		MessageBody: JSON.stringify(queueMessage),
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
	logger.trace('handleAuth', ...arguments);
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
	if (
		!user.Item ||
		!isUserActive(user.Item)
	) {
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

	const headers = await loginUser(parseDynamoDbAttributeMap(user.Item) as unknown as InternalUserObject);
	logger.debug('Auth headers', headers);
	logger.debug('Auth body', response);
	return {
		statusCode: 200,
		body: JSON.stringify(response),
		multiValueHeaders: headers,
	};
}

async function getUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.trace('getUser', ...arguments);
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
		response.isActive = !!user.isActive;
		response.isAdmin = !!user.isAdmin;
		response.isDistrictAdmin = !!user.isDistrictAdmin;
		response.phone = user.phone;
		response.fName = user.fName;
		response.lName = user.lName;
		response.talkgroups = user.talkgroups;
		validDepartments.forEach(dep => {
			if (typeof user[dep] === 'undefined') return;
			response[dep] = user[dep];
		});
		if (typeof user.fidoKeys !== 'undefined') {
			response.fidoKeyIds = Object.keys(user.fidoKeys).reduce((agg: {[key: string]: string }, key) => {
				if (user.fidoKeys && user.fidoKeys[key]) {
					agg[key] = user.fidoKeys[key].rawId;
				}
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
		validDepartments.forEach(dep => {
			if (typeof response[dep] === 'undefined') return;
			cookieMap[`cvfd-user-${dep}`] = JSON.stringify(response[dep]);
		});
		const cookieValues: string[] = [];
		Object.keys(cookieMap).forEach(cookie => {
			if (
				typeof cookies[cookie] === 'undefined' ||
				cookies[cookie] !== cookieMap[cookie]
			)
				cookieValues.push(`${cookie}=${cookieMap[cookie]}; Secure; SameSite=None; Path=/; Max-Age=${loginDuration}`);
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
					N: user.phone.toString(),
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
	logger.trace('handleLogout', ...arguments);
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
	const validUserTokens = user.loginTokens
		?.filter(token => token.token !== loginToken)
		.filter(token => (token.tokenExpiry || 0) > now)
		.map(token => ({
			M: {
				token: { S: token.token },
				tokenExpiry: { N: token.tokenExpiry.toString() },
			}
		}));
	const updateConfig: aws.DynamoDB.UpdateItemInput = {
		TableName: userTable,
		Key: {
			phone: { N: user.phone.toString() }
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

const adminUserKeys: aws.DynamoDB.ExpressionAttributeNameMap = {
	'#d': 'department',
	'#fn': 'fName',
	'#ln': 'lName',
	'#p': 'phone',
	'#tg': 'talkgroups',
	'#lli': 'lastLogin',
	'#gt': 'getTranscript',
};
validDepartments.forEach(dep => adminUserKeys[`#${dep}`] = dep);
const districtAdminUserKeys: aws.DynamoDB.ExpressionAttributeNameMap = {
	...adminUserKeys,
	'#gaa': 'getApiAlerts',
	'#gva': 'getVhfAlerts',
	'#gda': 'getDtrAlerts',
	'#da': 'isDistrictAdmin',
	'#lt': 'loginTokens',
	'#pgp': 'pagingPhone',
};

async function handleList(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.trace('handleList', ...arguments);
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
		!user.isAdmin
	) {
		return unauthorizedResponse;
	}

	// Get the users to return
	const keysToGet = user.isDistrictAdmin ? districtAdminUserKeys : adminUserKeys;
	let usersItems: aws.DynamoDB.ScanOutput;
	if (user.isDistrictAdmin) {
		usersItems = await dynamodb.scan({
			TableName: userTable,
			ExpressionAttributeNames: keysToGet,
			ProjectionExpression: Object.keys(keysToGet).join(','),
		}).promise();
	} else {
		// Get the departments the user is admin for
		let departmentsUserCanSee: UserDepartment[] = validDepartments
			.filter(dep => !!user[dep]?.admin && !!user[dep]?.active);
		usersItems = await dynamodb.scan({
			TableName: userTable,
			ExpressionAttributeNames: keysToGet,
			FilterExpression: departmentsUserCanSee.map(dep => `attribute_exists(#${dep})`).join(' OR '),
			ProjectionExpression: Object.keys(keysToGet).join(','),
		}).promise();
	}

	if (usersItems.Items)
		usersItems.Items = usersItems.Items.sort((a, b) => (a.lName?.S || '') > (b.lName?.S || '')
			? 1
			: -1);

	// Parse the users into a readable format
	const result: ApiUserListResponse = {
		success: true,
		users: (usersItems.Items || [])
			.map(parseDynamoDbAttributeMap)
			.map(v => v as unknown as UserObject),
	};

	return {
		statusCode: 200,
		body: JSON.stringify(result)
	};
}

interface EditKeyConfig {
	required?: boolean;
	name: keyof ApiUserUpdateBody;
	type: 'phone' | 'string' | 'talkgroups' | 'boolean' | 'department' | 'optDepartment';
	regex?: RegExp;
	partOfDepartment?: boolean;
}

const allowedToEditSelf: EditKeyConfig[] = [
	{
		name: 'phone',
		required: true,
		type: 'phone',
	},
	{
		name: 'fName',
		type: 'string',
	},
	{
		name: 'lName',
		type: 'string',
	},
	{
		name: 'talkgroups',
		type: 'talkgroups',
	},
];
const allowedToEditAdmin: EditKeyConfig[] = [
	...allowedToEditSelf,
	{
		name: 'getTranscript',
		type: 'boolean',
	},
];
const allowedToEditDistrictAdmin: EditKeyConfig[] = [
	...allowedToEditAdmin,
	{
		name: 'getApiAlerts',
		type: 'boolean',
	},
	{
		name: 'getVhfAlerts',
		type: 'boolean',
	},
	{
		name: 'getDtrAlerts',
		type: 'boolean',
	},
	{
		name: 'isDistrictAdmin',
		type: 'boolean',
	},
	{
		name: 'pagingPhone',
		type: 'optDepartment',
		required: false,
	},
];
const fieldsForCreate: EditKeyConfig[] = [
	{
		name: 'department',
		type: 'department',
	},
	{
		name: 'callSign',
		type: 'string',
		regex: /^[0-9A-Z\-]+$/,
		partOfDepartment: true,
	},
];

async function createOrUpdateUser(event: APIGatewayProxyEvent, create: boolean): Promise<APIGatewayProxyResult> {
	logger.trace('createOrUpdateUser', ...arguments);
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
	const body = JSON.parse(event.body as string) as ApiUserUpdateBody;
	const response: ApiResponse = {
		success: true,
		errors: []
	};
	if (body.isMe) {
		user.isAdmin = false;
		user.isDistrictAdmin = false;
	}

	// Validate the person has the right permissions
	if (
		(
			!(user.isAdmin || user.isDistrictAdmin) &&
			user.phone.toString() !== body.phone
		) ||
		!user.isActive
	) {
		return unauthorizedResponse;
	}

	// Validate the request
	let keysToValidate = body.isMe
		? allowedToEditSelf
		: user.isDistrictAdmin
			? allowedToEditDistrictAdmin
			: allowedToEditAdmin;
	if (create) {
		keysToValidate = [
			...keysToValidate,
			...fieldsForCreate,
		].map(item => ({
			...item,
			required: typeof item.required !== 'undefined' && !item.required
				? false
				: true,
		}));
	}
	let keysToSet: EditKeyConfig[] = [];
	keysToValidate.forEach(item => {
		// Check for missing required keys
		if (
			typeof body[item.name] === 'undefined' &&
			item.required
		) {
			response.errors.push(item.name);
			return;
		} else if (
			typeof body[item.name] === 'undefined'
		) return;

		const value = body[item.name];

		let isInvalid = false;
		switch (item.type) {
			case 'boolean':
				isInvalid = typeof value !== 'boolean';
				break;
			case 'optDepartment':
				if (value === null) {
					break;
				}
			case 'department':
				isInvalid = typeof value !== 'string' ||
					!validDepartments.includes(value as UserDepartment);
				break;
			case 'phone':
				isInvalid = typeof value !== 'string' ||
					value.replace(/[^0-9]/g, '').length !== 10;
				break;
			case 'string':
				isInvalid = typeof value !== 'string' ||
					value.length === 0;
				break;
			case 'talkgroups':
				isInvalid = !Array.isArray(value) ||
					value.filter(v => pagingTalkgroupOrder.includes(v as PagingTalkgroup)).length !== value.length;
				break;
		}

		if (!isInvalid && item.regex) {
			isInvalid = !item.regex.test(value as string);
		}

		if (isInvalid) {
			response.errors.push(item.name);
		} else if (item.name !== 'phone') {
			keysToSet.push(item);
		}
	});

	// Make sure we are going to set at least something
	if (response.errors.length === 0 && keysToSet.length === 0) {
		response.errors.push('phone');
	}

	// Check to see if the phone number already exists
	let newPhone: aws.DynamoDB.GetItemOutput | undefined;
	if (response.errors.length === 0) {
		body.phone = body.phone.replace(/[^0-9]/g, '');
		newPhone = await dynamodb.getItem({
			TableName: userTable,
			Key: {
				phone: { N: body.phone }
			}
		}).promise();
		// Trying to edit a non-existant user
		if (!newPhone.Item && !create) {
			response.errors.push('phone');
		}

		// Trying to add a department to a user who is already on that department
		if (
			newPhone.Item &&
			create &&
			typeof newPhone.Item[body.department as UserDepartment] !== 'undefined'
		) {
			response.errors.push('phone');
			response.message = 'That phone number is already in use on your department';
		}
	}

	if (response.errors.length > 0) {
		response.success = false;
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}
	
	// Create or update the user
	let setExpressions: string[] = [];
	let deleteExpressions: string[] = [];
	const updateConfig: aws.DynamoDB.UpdateItemInput & Required<Pick<aws.DynamoDB.UpdateItemInput, 'ExpressionAttributeNames'>> = {
		TableName: userTable,
		Key: {
			phone: { N: body.phone }
		},
		ExpressionAttributeNames: {},
		UpdateExpression: '',
		ReturnValues: 'UPDATED_NEW'
	};
	keysToSet.forEach(item => {
		// Exit early for items that are a part of the department but not the department name
		if (
			item.partOfDepartment &&
			item.name !== 'department'
		) return;

		// Handle the special department case
		if (item.type === 'department') {
			updateConfig.ExpressionAttributeNames[`#${item.name}`] = body[item.name] as string;
			updateConfig.ExpressionAttributeValues = updateConfig.ExpressionAttributeValues || {};
			updateConfig.ExpressionAttributeValues[`:${item.name}`] = {
				M: {
					active: { BOOL: true },
					callSign: { S: body.callSign },
				}
			};
			setExpressions.push(`#${item.name} = :${item.name}`);
			return;
		}

		// Exit early if we're "creating" a new user by just adding a department
		if (create && newPhone?.Item) {
			return;
		}

		// The name to use
		updateConfig.ExpressionAttributeNames[`#${item.name}`] = item.name;

		// Determine how we should use the item
		let setValue: AWS.DynamoDB.AttributeValue | false = false;
		switch (item.type) {
			case 'string':
				setValue = { S: body[item.name] as string };
				break;
			case 'talkgroups':
				if ((body[item.name] as any[]).length > 0) {
					setValue = {
						NS: (body[item.name] as number[]).map(v => v.toString())
					};
				}
				break;
			case 'boolean':
				if (body[item.name]) {
					setValue = { BOOL: true };
				}
				break;
			case 'optDepartment':
				if (body[item.name] !== null) {
					setValue = { S: body[item.name] as string };
				}
		}

		if (setValue === false) {
			deleteExpressions.push(`#${item.name}`);
		} else {
			updateConfig.ExpressionAttributeValues = updateConfig.ExpressionAttributeValues || {};
			updateConfig.ExpressionAttributeValues[`:${item.name}`] = setValue;
			setExpressions.push(`#${item.name} = :${item.name}`);
		}
	});
	
	updateConfig.UpdateExpression = '';
	if (setExpressions.length > 0) {
		updateConfig.UpdateExpression = `SET ${setExpressions.join(', ')}`;
		if (deleteExpressions.length > 0) {
			updateConfig.UpdateExpression += ' ';
		}
	}
	if (deleteExpressions.length > 0) {
		updateConfig.UpdateExpression += `REMOVE ${deleteExpressions.join(', ')}`;
	}

	await dynamodb.updateItem(updateConfig).promise();
	if (create) {
		const queueMessage: ActivateBody = {
			action: 'activate',
			phone: body.phone,
			department: body.department as UserDepartment,
		};
		await sqs.sendMessage({
			MessageBody: JSON.stringify(queueMessage),
			QueueUrl: queueUrl
		}).promise();
	}

	return {
		statusCode: response.success ? 200 : 400,
		body: JSON.stringify(response),
	};
}

async function updateUserGroup(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.trace('updateUserGroup', ...arguments);
	const user = await getLoggedInUser(event);
	const unauthorizedResponse = {
		statusCode: 403,
		body: JSON.stringify({
			success: false,
			message: 'You are not permitted to access this area'
		}),
	};
	if (user === null || !user.isAdmin) {
		return unauthorizedResponse;
	}

	// Validate and parse the body
	validateBodyIsJson(event.body);
	const body = JSON.parse(event.body as string) as ApiUserUpdateGroupBody;
	const response: ApiResponse = {
		success: true,
		errors: [],
	};

	// Validate the department
	if (
		typeof body.department !== 'string' ||
		!validDepartments.includes(body.department)
	) {
		response.errors.push('department');
		response.success = false;
		return {
			statusCode: 400,
			body: JSON.stringify(response),
		};
	}

	// Validate the permissions
	if (
		!user.isDistrictAdmin &&
		!user[body.department]?.admin
	) {
		return unauthorizedApiResponse;
	}

	// Validate the body
	if (
		typeof body.phone !== 'string' ||
		body.phone.replace(/[^0-9]/g, '').length !== 10
	) {
		response.errors.push('phone');
	} else {
		body.phone = body.phone.replace(/[^0-9]/g, '');
	}
	if (
		typeof body.active !== 'undefined' &&
		typeof body.active !== 'boolean'
	) {
		response.errors.push('active');
	}
	if (
		(
			typeof body.callSign !== 'undefined' &&
			typeof body.callSign !== 'string'
		) ||
		(
			typeof body.callSign === 'string' &&
			body.callSign.length < 1
		)
	) {
		response.errors.push('callSign');
	}
	if (
		typeof body.admin !== 'undefined' &&
		typeof body.admin !== 'boolean'
	) {
		response.errors.push('admin');
	}
	if (
		typeof body.admin === 'undefined' &&
		typeof body.active === 'undefined' &&
		typeof body.callSign === 'undefined'
	) {
		response.errors.push('admin', 'active', 'callSign');
	}

	// Make sure the phone number exists
	let phoneUser: aws.DynamoDB.AttributeMap | undefined;
	if (response.errors.length === 0) {
		phoneUser = (await dynamodb.getItem({
			TableName: userTable,
			Key: {
				phone: { N: body.phone },
			},
		}).promise()).Item;
		if (!phoneUser) {
			response.errors.push('phone');
		}
	}

	// Check to make sure there will be a callSign
	if (
		typeof phoneUser !== 'undefined' &&
		typeof phoneUser[body.department] === 'undefined' &&
		typeof body.callSign === 'undefined'
	) {
		response.errors.push('callSign');
	}

	if (response.errors.length > 0 || typeof phoneUser === 'undefined') {
		response.success = false;
		return {
			statusCode: 400,
			body: JSON.stringify(response),
		};
	}

	// Perform the update
	const updateConfig: aws.DynamoDB.UpdateItemInput & Required<Pick<aws.DynamoDB.UpdateItemInput, 'ExpressionAttributeNames' | 'ExpressionAttributeValues'>> = {
		TableName: userTable,
		Key: {
			phone: { N: body.phone },
		},
		ExpressionAttributeNames: {
			'#dep': body.department,
		},
		ExpressionAttributeValues: {},
		UpdateExpression: '',
		ReturnValues: 'UPDATED_NEW',
	};
	if (typeof phoneUser[body.department] === 'undefined') {
		updateConfig.ExpressionAttributeValues[':dep'] = {
			M: {
				active: { BOOL: body.active || false },
				callSign: { S: body.callSign || '' },
				admin: { BOOL: body.admin || false },
			}
		};
		updateConfig.UpdateExpression = 'SET #dep = :dep';
	} else {
		let updateStrings: string[] = [];
		if (typeof body.active !== 'undefined') {
			updateConfig.ExpressionAttributeNames['#ac'] = 'active';
			updateConfig.ExpressionAttributeValues[':ac'] = { BOOL: body.active };
			updateStrings.push('#dep.#ac = :ac');
		}
		if (typeof body.callSign !== 'undefined') {
			updateConfig.ExpressionAttributeNames['#cs'] = 'callSign';
			updateConfig.ExpressionAttributeValues[':cs'] = { S: body.callSign };
			updateStrings.push('#dep.#cs = :cs');
		}
		if (typeof body.admin !== 'undefined') {
			updateConfig.ExpressionAttributeNames['#ad'] = 'admin';
			updateConfig.ExpressionAttributeValues[':ad'] = { BOOL: body.admin };
			updateStrings.push('#dep.#ad = :ad');
		}
		updateConfig.UpdateExpression = `SET ${updateStrings.join(', ')}`;
	}
	const result = await dynamodb.updateItem(updateConfig).promise();
	if (!result.Attributes) {
		response.success = false;
	} else if (
		body.active &&
		!phoneUser[body.department]?.M?.active?.BOOL &&
		body.department !== 'PageOnly'
	) {
		const queueMessage: ActivateBody = {
			action: 'activate',
			phone: body.phone,
			department: body.department,
		};
		await sqs.sendMessage({
			MessageBody: JSON.stringify(queueMessage),
			QueueUrl: queueUrl
		}).promise();
	}

	return {
		statusCode: response.success ? 200 : 400,
		body: JSON.stringify(response),
	};
}

async function deleteUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.trace('deleteUser', ...arguments);
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
		!user.isAdmin ||
		!user.isActive
	) {
		return unauthorizedResponse;
	}

	// Validate and parse the body
	validateBodyIsJson(event.body);
	const body = JSON.parse(event.body as string) as ApiUserUpdateBody;
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
	if (
		typeof body.department !== 'undefined' &&
		!validDepartments.includes(body.department)
	) {
		response.errors.push('department');
	}
	if (response.errors.length > 0) {
		response.success = false;
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	// Check for the correct permissions
	if (
		!user.isDistrictAdmin &&
		(
			typeof body.department === 'undefined' ||
			!user[body.department]?.admin ||
			!user[body.department]?.active
		)
	) {
		return unauthorizedApiResponse;
	}

	// Delete the user
	if (typeof body.department === 'undefined') {
		await dynamodb.deleteItem({
			TableName: userTable,
			Key: {
				phone: { N: body.phone }
			}
		}).promise();
	} else {
		await dynamodb.updateItem({
			TableName: userTable,
			Key: {
				phone: { N: body.phone }
			},
			ExpressionAttributeNames: {
				'#dep': body.department,
			},
			UpdateExpression: 'REMOVE #dep',
		}).promise();
	}

	return {
		statusCode: 200,
		body: JSON.stringify(response)
	};
}

function getFidoLib() {
	logger.trace('getFidoLib', ...arguments);
	return new Fido2Lib({
		timeout: 60,
		rpId: 'cofrn.org',
		rpName: 'CVFD DTR',
		challengeSize: 128,
	});
}

function base64ToBuffer(base64: string): Buffer {
	logger.trace('base64ToBuffer', ...arguments);
	return Buffer.from(base64, 'base64');
}

function bufferToBase64(buffer: ArrayBuffer): string {
	logger.trace('bufferToBase64', ...arguments);
	return Buffer.from(buffer).toString('base64');
}

async function fidoGetChallenge(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.trace('fidoGetChallenge', ...arguments);
	const user = await getLoggedInUser(event);
	if (user === null)
		return unauthorizedApiResponse;

	// Validate and parse the body
	validateBodyIsJson(event.body);
	const body = JSON.parse(event.body as string) as {
		name: string;
	};
	if (
		typeof user.fidoKeys !== 'undefined' &&
		typeof user.fidoKeys[body.name] !== 'undefined'
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

	const userId = typeof user.fidoUserId !== 'undefined'
		? base64ToBuffer(user.fidoUserId)
		: crypto.randomBytes(32);

	const response: ApiUserFidoChallengeResponse = {
		success: true,
		options: {
			challenge: bufferToBase64(options.challenge),
			rp: options.rp,
			user: {
				name: user.phone as string,
				displayName: `${user.fName} ${user.lName}`,
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
	logger.trace('fidoRegister', ...arguments);
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
			origin: 'https://cofrn.org',
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
					phone: { N: user.phone.toString() },
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
					phone: { N: user.phone.toString() },
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
	logger.trace('fidoGetAuth', ...arguments);
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
	logger.trace('fidoAuth', ...arguments);
	// Validate the body
	validateBodyIsJson(event.body);

	// Parse the body
	const body = JSON.parse(event.body as string) as ApiUserFidoAuthBody;

	// Get the user
	let user: InternalUserObject | null = null;
	if (body.test) {
		user = await getLoggedInUser(event);
	} else if (typeof body.phone !== 'undefined') {
		user = await dynamodb.getItem({
			TableName: userTable,
			Key: {
				phone: { N: body.phone }
			}
		}).promise()
			.then(data => data.Item || null)
			.then(data => data === null ? data : parseDynamoDbAttributeMap(data) as unknown as InternalUserObject);
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
		origin: 'https://cofrn.org',
		factor: 'either',
		publicKey: fidoKey.pubKey,
		prevCounter: fidoKey.prevCount,
		userHandle: user.fidoUserId as string,
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
	logger.debug('main', ...arguments);
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
			case 'updateGroup':
				return await updateUserGroup(event);
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
