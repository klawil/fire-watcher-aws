import * as aws from 'aws-sdk';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { validateBodyIsJson } from '../../utils/general';
import { parseDynamoDbAttributeMap, parseDynamoDbAttributeValue } from '../../utils/dynamodb';
import { getCookies, getLoggedInUser } from '../../utils/auth';
import { authTokenCookie, authUserCookie, isUserActive } from '../types/auth';
import { ApiUserAuthResponse, ApiUserGetUserResponse, ApiUserListResponse, ApiUserLoginResult, ApiUserUpdateBody, ApiUserUpdateGroupBody, ApiUserUpdateResponse, InternalUserObject, UserObject } from '../../../common/userApi';
import { unauthorizedApiResponse } from '../types/api';
import { ActivateBody, LoginBody } from '../types/queue';
import { getLogger } from '../../../logic/logger';
import { PagingTalkgroup, pagingTalkgroups, UserDepartment, validDepartments } from '@/types/api/users';
import { sign } from 'jsonwebtoken';

const logger = getLogger('user');

const loginDuration = 60 * 60 * 24 * 31; // Logins last 31 days

const dynamodb = new aws.DynamoDB();
const sqs = new aws.SQS();
const secretsManager = new aws.SecretsManager();

const queueUrl = process.env.SQS_QUEUE;
const userTable = process.env.TABLE_USER;
const jwtSecretArn = process.env.JWT_SECRET;

interface ApiResponse {
	success: boolean;
	errors: string[];
	message?: string;
	data?: unknown[];
}

interface FidoKey {
	prevCount: number;
	pubKey: string;
	rawId: string;
}

interface FidoKeys {
	[key: string]: FidoKey;
};

const userCookieConfigs: {
	name: string;
	value: (user: InternalUserObject) => string;
}[] = [
	{
		name: 'cofrn-user-name',
		value: u => u.fName,
	},
	{
		name: 'cofrn-user-admin',
		value: u => u.isAdmin ? '1' : '0',
	},
	{
		name: 'cofrn-user-super',
		value: u => u.isDistrictAdmin ? '1' : '0',
	},
	{
		name: 'cofrn-user-departments',
		value: u => JSON.stringify(validDepartments
			.reduce((agg: {
				[key in UserDepartment]?: InternalUserObject[UserDepartment];
			}, dep) => {
				if (typeof u[dep] !== 'undefined') {
					agg[dep] = u[dep];
				}

				return agg;
			}, {})
		),
	},
];

function getUserCookieHeaders(
	event: APIGatewayProxyEvent,
	user: InternalUserObject | null,
	extraCookies: string[] = [],
): {
	'Set-Cookie': string[],
} {
	const cookieSetStrings: string[] = [];
	const cookiesToSet: string[] = [];

	// Set the user cookies to what they should be
	const cookies = getCookies(event);
	if (user !== null) {
		userCookieConfigs.forEach(config => {
			const cookieValue = config.value(user);
			if (cookieValue !== cookies[config.name]) {
				cookieSetStrings.push(`${config.name}=${encodeURIComponent(config.value(user))}`);
			}
			cookiesToSet.push(config.name);
		});
	}

	// Determine which cookies to delete
	const cookiesToDelete: string[] = Object.keys(cookies)
		.filter(cookie => cookie.startsWith('cofrn-user')
			&& cookie !== authUserCookie
			&& !cookiesToSet.some(setCookie => setCookie === cookie));

	return {
		'Set-Cookie': [
			...cookieSetStrings.map(v => `${v}; Secure; SameSite=None; Path=/; Max-Age=${loginDuration}`),
			...cookiesToDelete.map(v => `${v}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`),
			...extraCookies.map(v => `${v}; Secure; SameSite=None; Path=/; Max-Age=${loginDuration}`),
		],
	};
}

async function loginUser(event: APIGatewayProxyEvent, user: InternalUserObject) {
	logger.trace('loginUser', ...arguments);
	// Find the previous tokens that should be deleted
	const now = Date.now();
	const validUserTokens = user.loginTokens
		?.filter(token => (token.tokenExpiry || 0) > now) || [];

	// Create a new token and attach it
	const jwtSecret = await secretsManager.getSecretValue({
		SecretId: jwtSecretArn,
	}).promise().then(data => data.SecretString);
	if (typeof jwtSecret === 'undefined')
		throw new Error(`Unable to get JWT secret`);
	const token = sign({ phone: Number(user.phone) }, jwtSecret, {
		expiresIn: `${loginDuration}s`,
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

	return getUserCookieHeaders(
		event,
		user,
		[
			`${authUserCookie}=${user.phone}`,
			`${authTokenCookie}=${encodeURIComponent(token)}`,
		],
	);
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
	const user: aws.DynamoDB.GetItemOutput = await dynamodb.getItem({
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

	const headers = await loginUser(
		event,
		parseDynamoDbAttributeMap(user.Item) as unknown as InternalUserObject
	);
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
		const setCookiesHeader = getUserCookieHeaders(
			event,
			user,
		);
		if (setCookiesHeader['Set-Cookie'].length > 0) {
			httpResponse.multiValueHeaders = setCookiesHeader;
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

	const cookies = getCookies(event);
	const cookiesToDelete = Object.keys(cookies)
		.filter(cookie => cookie.startsWith('cofrn-'));
	const response: APIGatewayProxyResult = {
		statusCode: 302,
		body: 'Logged Out',
		multiValueHeaders: {
			'Set-Cookie': cookiesToDelete.map(v => `${v}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`),
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
		const departmentsUserCanSee: UserDepartment[] = validDepartments
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

function attributeMapToSafeUser(
	userValues: aws.DynamoDB.AttributeMap,
	loggedInUser: InternalUserObject,
): UserObject {
	const queryKeysToGet = loggedInUser.isDistrictAdmin ? districtAdminUserKeys : adminUserKeys;
	const keysToGet = (Object.keys(queryKeysToGet) as (keyof typeof queryKeysToGet)[])
		.map(key => queryKeysToGet[key]);
	const fullUser = parseDynamoDbAttributeMap(userValues) as unknown as UserObject;
	(Object.keys(fullUser) as (keyof typeof fullUser)[]).forEach(key => {
		if (!keysToGet.includes(key)) {
			delete fullUser[key];
		}
	});

	return fullUser;
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
		required: false,
	},
];
const allowedToEditDistrictAdmin: EditKeyConfig[] = [
	...allowedToEditAdmin,
	{
		name: 'getApiAlerts',
		type: 'boolean',
		required: false,
	},
	{
		name: 'getVhfAlerts',
		type: 'boolean',
		required: false,
	},
	{
		name: 'getDtrAlerts',
		type: 'boolean',
		required: false,
	},
	{
		name: 'isDistrictAdmin',
		type: 'boolean',
		required: false,
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
	const response: ApiUserUpdateResponse = {
		success: true,
		errors: [],
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
	const keysToSet: EditKeyConfig[] = [];
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
					value.filter(v => pagingTalkgroups.includes(v as PagingTalkgroup)).length !== value.length;
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
	const setExpressions: string[] = [];
	const deleteExpressions: string[] = [];
	const updateConfig: aws.DynamoDB.UpdateItemInput & Required<Pick<aws.DynamoDB.UpdateItemInput, 'ExpressionAttributeNames'>> = {
		TableName: userTable,
		Key: {
			phone: { N: body.phone }
		},
		ExpressionAttributeNames: {},
		UpdateExpression: '',
		ReturnValues: 'ALL_NEW'
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
				if ((body[item.name] as unknown[]).length > 0) {
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

	const updateResult = await dynamodb.updateItem(updateConfig).promise();
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
	if (updateResult.Attributes) {
		response.user = attributeMapToSafeUser(updateResult.Attributes, user);
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
	const response: ApiUserUpdateResponse = {
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
		ReturnValues: 'ALL_NEW',
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
		const updateStrings: string[] = [];
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
		response.user = attributeMapToSafeUser(result.Attributes, user);
	}

	if (result.Attributes) {
		response.user = attributeMapToSafeUser(result.Attributes, user);
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

export async function main(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.debug('main', ...arguments);
	const action = event.queryStringParameters?.action || 'none';
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
}
