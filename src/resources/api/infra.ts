import * as aws from 'aws-sdk';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getTwilioSecret, validateBodyIsJson } from '@/deprecated/utils/general';
import { parseDynamoDbAttributeMap } from '@/deprecated/utils/dynamodb';
import { PageBody } from '@/deprecated/types/queue';
import { getLogger } from '@/utils/common/logger';
import { mergeDynamoQueries } from '@/deprecated/utils/dynamo';
import { PagingTalkgroup } from '@/types/api/users';
import { SiteStatusQueueItem } from '@/types/backend/queue';

const logger = getLogger('infra');

const dynamodb = new aws.DynamoDB();
const sqs = new aws.SQS();
const cloudWatch = new aws.CloudWatch();

const s3Bucket = process.env.S3_BUCKET;
const sqsQueue = process.env.SQS_QUEUE;
const dtrTable = process.env.TABLE_FILE;
const userTable = process.env.TABLE_USER;
const textTable = process.env.TABLE_TEXT;
const statusTable = process.env.TABLE_STATUS;

interface GenericApiResponse {
	success: boolean;
	errors: string[];
	message?: string;
	data?: unknown[];
}

interface HeartbeatBody {
	code: string;
	Server: string;
	Program: string;
	IsPrimary: boolean;
	IsActive: boolean;
}

interface PageHttpBody {
	code: string;
	key: string;
	tg: PagingTalkgroup;
	len: number;
	isTest?: boolean;
}

async function handlePage(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.trace('handlePage', ...arguments);
	// Validate the body
	validateBodyIsJson(event.body);

	// Parse the body
	const body: PageHttpBody = JSON.parse(event.body as string);
	const response: GenericApiResponse = {
		success: true,
		errors: []
	};

	// Get the API code
	const twilioConf = await getTwilioSecret();

	// Validate the body
	if (!body.code || body.code !== twilioConf.apiCode) {
		response.success = false;
		response.errors.push('code');
		response.errors.push('key');
	}
	if (!body.key) {
		response.success = false;
		response.errors.push('key');
	}
	if (!body.tg) {
		response.success = false;
		response.errors.push('tg');
	}
	if (!body.len || typeof body.len !== 'number') {
		response.success = false;
		response.errors.push('len');
	}

	if (
		response.success &&
		body.key.indexOf('BG_FIRE') === -1 &&
		event.queryStringParameters?.action === 'dtrPage'
	) {
		const sqsEvent: PageBody = {
			action: 'page',
			key: body.key,
			tg: body.tg,
			len: body.len,
			isTest: !!body.isTest
		};
		response.data = [ sqsEvent ];

		await sqs.sendMessage({
			MessageBody: JSON.stringify(sqsEvent),
			QueueUrl: sqsQueue
		}).promise();
	}

	if (!response.success) {
		logger.error('handlePage', '400', response);
	}

	return {
		statusCode: response.success ? 200 : 400,
		body: JSON.stringify(response)
	};
}

async function handleHeartbeat(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.trace('handleHeartbeat', ...arguments);
	// Validate the body
	validateBodyIsJson(event.body);

	// Parse the body
	const body = JSON.parse(event.body as string) as HeartbeatBody;
	const response: GenericApiResponse = {
		success: true,
		errors: []
	};

	// Get the API code
	const twilioConf = await getTwilioSecret();

	// Validate the body
	if (!body.code || body.code !== twilioConf.apiCode) {
		response.success = false;
		response.errors.push('code');
	}
	const neededFields: { [key in keyof HeartbeatBody]?: string } = {
		Server: 'string',
		Program: 'string',
		IsPrimary: 'boolean',
		IsActive: 'boolean'
	};
	(Object.keys(neededFields) as (keyof HeartbeatBody)[])
		.forEach(key => {
			if (typeof body[key] !== neededFields[key]) {
				response.errors.push(key);
				response.success = false;
			}
		});

	if (!response.success) {
		logger.error('handleHeartbeat', response);
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	await dynamodb.updateItem({
		TableName: statusTable,
		Key: {
			ServerProgram: {
				S: `${body.Server}:${body.Program}`
			},
			Program: {
				S: body.Program
			}
		},
		ExpressionAttributeNames: {
			'#s': 'Server',
			'#ip': 'IsPrimary',
			'#ia': 'IsActive',
			'#lh': 'LastHeartbeat'
		},
		ExpressionAttributeValues: {
			':s': { S: body.Server },
			':ip': { BOOL: body.IsPrimary },
			':ia': { BOOL: body.IsActive },
			':lh': { N: Date.now().toString() }
		},
		UpdateExpression: 'SET #s = :s, #ip = :ip, #ia = :ia, #lh = :lh'
	}).promise();

	response.data = await dynamodb.scan({
		TableName: statusTable,
		ExpressionAttributeNames: {
			'#p': 'Program'
		},
		ExpressionAttributeValues: {
			':p': { S: body.Program }
		},
		FilterExpression: '#p = :p'
	}).promise()
		.then(data => data.Items || [])
		.then(data => data.map(parseDynamoDbAttributeMap));

	await cloudWatch.putMetricData({
		Namespace: 'VHF Metrics',
		MetricData: [{
			MetricName: body.Server,
			Timestamp: new Date(),
			Unit: 'Count',
			Value: 1,
		}],
	}).promise();

	return {
		statusCode: 200,
		body: JSON.stringify(response)
	};
}

interface AdjacentSitesBodyItem {
	time: string;
	rfss: string;
	site: string;
	sys_shortname: string;
	conv_ch: boolean;
	site_failed: boolean;
	valid_info: boolean;
	composite_ctrl: boolean;
	active_conn: boolean;
	backup_ctrl: boolean;
	no_service_req: boolean;
	supports_data: boolean;
	supports_voice: boolean;
	supports_registration: boolean;
	supports_authentication: boolean;
};

interface AdjacentSitesBodyItemCombinedBoolean {
	[key: string]: boolean;
}
interface AdjacentSitesBodyItemCombined {
	time: { [key: string]: string };
	rfss: string;
	site: string;
	conv_ch: AdjacentSitesBodyItemCombinedBoolean;
	site_failed: AdjacentSitesBodyItemCombinedBoolean;
	valid_info: AdjacentSitesBodyItemCombinedBoolean;
	composite_ctrl: AdjacentSitesBodyItemCombinedBoolean;
	active_conn: AdjacentSitesBodyItemCombinedBoolean;
	backup_ctrl: AdjacentSitesBodyItemCombinedBoolean;
	no_service_req: AdjacentSitesBodyItemCombinedBoolean;
	supports_data: AdjacentSitesBodyItemCombinedBoolean;
	supports_voice: AdjacentSitesBodyItemCombinedBoolean;
	supports_registration: AdjacentSitesBodyItemCombinedBoolean;
	supports_authentication: AdjacentSitesBodyItemCombinedBoolean;
}

interface AdjacentSitesBody {
	type: 'adjacent';
	code: string;
	adjacent: ('' | AdjacentSitesBodyItem[])[]
};

async function handleSiteStatus(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.trace('handleSiteStatus', ...arguments);
	// Validate the body
	validateBodyIsJson(event.body);

	// Parse the body
	const body = JSON.parse(event.body as string) as AdjacentSitesBody;
	const response: GenericApiResponse = {
		success: true,
		errors: []
	};

	// Get the API code
	const twilioConf = await getTwilioSecret();

	// Validate the body
	if (!body.code || body.code !== twilioConf.apiCode) {
		response.success = false;
		response.errors.push('code');
	}
	const neededFields: { [key in keyof AdjacentSitesBodyItem]: string } = {
		time: 'string',
		rfss: 'string',
		site: 'string',
		sys_shortname: 'string',
		conv_ch: 'boolean',
		site_failed: 'boolean',
		valid_info: 'boolean',
		composite_ctrl: 'boolean',
		active_conn: 'boolean',
		backup_ctrl: 'boolean',
		no_service_req: 'boolean',
		supports_data: 'boolean',
		supports_voice: 'boolean',
		supports_registration: 'boolean',
		supports_authentication: 'boolean',
	};
	if (!Array.isArray(body.adjacent)) {
		response.success = false;
		response.errors.push('adjacent');
	} else {
		body.adjacent
			.filter(adjacent => adjacent !== '')
			.forEach((adjacentItems, i1) => (adjacentItems as AdjacentSitesBodyItem[]).forEach((item, i2) => {
				(Object.keys(neededFields) as (keyof AdjacentSitesBodyItem)[]).forEach(key => {
					if (typeof item[key] !== neededFields[key]) {
						response.errors.push(`${i1}-${i2}-${key}`);
						response.success = false;
					}
				});
			}));
	}

	if (!response.success) {
		logger.error('handleSiteStatus', '400', response);
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	const queueMessage: SiteStatusQueueItem = {
		action: 'site-status',
		sites: {},
	};

	// Consolidate the rows
	const sites: { [key: string]: AdjacentSitesBodyItemCombined } = {};
	body.adjacent
		.filter(sites => sites !== '')
		.forEach(sysSites => (sysSites as AdjacentSitesBodyItem[]).forEach(site => {
			const siteId = `${site.rfss}-${site.site}`;
			const system = site.sys_shortname;

			if (typeof sites[siteId] === 'undefined') {
				queueMessage.sites[siteId] = {
					UpdateTime: { [system]: Number(site.time) },
					ConvChannel: { [system]: site.conv_ch },
					SiteFailed: { [system]: site.site_failed },
					ValidInfo: { [system]: site.valid_info },
					CompositeCtrl: { [system]: site.composite_ctrl },
					ActiveConn: { [system]: site.active_conn },
					BackupCtrl: { [system]: site.backup_ctrl },
					NoServReq: { [system]: site.no_service_req },
					SupportData: { [system]: site.supports_data },
					SupportVoice: { [system]: site.supports_voice },
					SupportReg: { [system]: site.supports_registration },
					SupportAuth: { [system]: site.supports_authentication },
				};
				return;
			}

			queueMessage.sites[siteId].UpdateTime[system] = Number(site.time);
			queueMessage.sites[siteId].ConvChannel[system] = site.conv_ch;
			queueMessage.sites[siteId].SiteFailed[system] = site.site_failed;
			queueMessage.sites[siteId].ValidInfo[system] = site.valid_info;
			queueMessage.sites[siteId].CompositeCtrl[system] = site.composite_ctrl;
			queueMessage.sites[siteId].ActiveConn[system] = site.active_conn;
			queueMessage.sites[siteId].BackupCtrl[system] = site.backup_ctrl;
			queueMessage.sites[siteId].NoServReq[system] = site.no_service_req;
			queueMessage.sites[siteId].SupportData[system] = site.supports_data;
			queueMessage.sites[siteId].SupportVoice[system] = site.supports_voice;
			queueMessage.sites[siteId].SupportReg[system] = site.supports_registration;
			queueMessage.sites[siteId].SupportAuth[system] = site.supports_authentication;
		}));

	await sqs.sendMessage({
		QueueUrl: sqsQueue,
		MessageBody: JSON.stringify(queueMessage),
	}).promise();

	return {
		statusCode: 200,
		body: JSON.stringify(response)
	};
}

async function handleDtrExists(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.trace('handleDtrExists', ...arguments);
	validateBodyIsJson(event.body);

	const s3 = new aws.S3();

	const files: string[] = JSON.parse(event.body as string).files;
	const badFiles: string[] = await Promise.all(files
		.map(f => s3.headObject({
			Bucket: s3Bucket,
			Key: `audio/dtr/${f}`
		}).promise().catch(() => f)))
		.then(data => data.filter(f => typeof f === 'string') as string[]);

	return {
		statusCode: 200,
		headers: {},
		body: JSON.stringify(badFiles)
	};
}

async function handleDtrExistsSingle(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.trace('handleDtrExistsSingle', ...arguments);
	event.queryStringParameters = event.queryStringParameters || {};
	const response: GenericApiResponse & {
		exists: boolean;
	} = {
		success: true,
		exists: false,
		errors: []
	};
	
	// Validate the query parameters
	if (
		!event.queryStringParameters.tg ||
		!/^[0-9]+$/.test(event.queryStringParameters.tg)
	) {
		response.errors.push('tg');
	}
	if (
		!event.queryStringParameters.start ||
		!/^[0-9]+$/.test(event.queryStringParameters.start)
	) {
		response.errors.push('start');
	}
	if (response.errors.length > 0) {
		response.success = false;
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	// Find the item
	const result = await dynamodb.query({
		TableName: dtrTable,
		IndexName: 'StartTimeTgIndex',
		ExpressionAttributeNames: {
			'#tg': 'Talkgroup',
			'#st': 'StartTime'
		},
		ExpressionAttributeValues: {
			':tg': {
				N: event.queryStringParameters.tg
			},
			':st': {
				N: event.queryStringParameters.start
			}
		},
		KeyConditionExpression: '#tg = :tg AND #st = :st'
	}).promise();
	response.exists = typeof result.Items !== 'undefined'
		&& result.Items.length > 0;

	return {
		statusCode: 200,
		body: JSON.stringify(response)
	};
}

const testingUser = process.env.TESTING_USER as string;
async function handleTestState(event: APIGatewayProxyEvent, testOn: boolean): Promise<APIGatewayProxyResult> {
	logger.trace('handleTestState', ...arguments);
	const response: GenericApiResponse = {
		success: true,
		errors: []
	};

	// Get the API code
	const twilioConf = await getTwilioSecret();

	// Validate the code
	event.queryStringParameters = event.queryStringParameters || {};
	if (event.queryStringParameters.code !== twilioConf.apiCode) {
		response.success = false;
		response.errors.push('auth');
		logger.error('handleTestState', '400', response);
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	// Update the user
	const updateConfig: aws.DynamoDB.UpdateItemInput = {
		TableName: userTable,
		Key: {
			phone: { N: testingUser }
		},
		ExpressionAttributeNames: {
			'#it': 'isTest'
		},
		ExpressionAttributeValues: {
			':it': { BOOL: true }
		},
		UpdateExpression: 'SET #it = :it'
	};
	if (!testOn) {
		delete updateConfig.ExpressionAttributeValues;
		updateConfig.UpdateExpression = 'REMOVE #it';
	}

	await dynamodb.updateItem(updateConfig).promise();

	return {
		statusCode: 200,
		body: JSON.stringify(response)
	};
}

async function getTestTexts(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.trace('getTestTexts', ...arguments);
	const response: GenericApiResponse = {
		success: true,
		errors: []
	};

	// Get the API code
	const twilioConf = await getTwilioSecret();

	// Validate the code
	event.queryStringParameters = event.queryStringParameters || {};
	if (event.queryStringParameters.code !== twilioConf.apiCode) {
		response.success = false;
		response.errors.push('auth');
		logger.error('getTestTexts', '400', response);
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	// Retrieve the texts
	const result = await mergeDynamoQueries(
		[
			{
				TableName: textTable,
				IndexName: 'testPageIndex',
				Limit: 50,
				ScanIndexForward: false,
				ExpressionAttributeNames: {
					'#tpi': 'testPageIndex'
				},
				ExpressionAttributeValues: {
					':tpi': { S: 'yn' }
				},
				KeyConditionExpression: '#tpi = :tpi'
			},
			{
				TableName: textTable,
				IndexName: 'testPageIndex',
				Limit: 50,
				ScanIndexForward: false,
				ExpressionAttributeNames: {
					'#tpi': 'testPageIndex'
				},
				ExpressionAttributeValues: {
					':tpi': { S: 'yy' }
				},
				KeyConditionExpression: '#tpi = :tpi'
			}
		],
		'datetime',
	);
	response.data = result.Items?.map(parseDynamoDbAttributeMap);

	return {
		statusCode: 200,
		headers: {},
		body: JSON.stringify(response)
	};
}

async function handleMetrics(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.trace('handleMetrics', ...arguments);
	const date = new Date();
	const response: GenericApiResponse = {
		success: true,
		errors: []
	};

	// Get the API code
	const twilioConf = await getTwilioSecret();

	// Validate the code
	event.queryStringParameters = event.queryStringParameters || {};
	if (event.queryStringParameters.code !== twilioConf.apiCode) {
		response.success = false;
		response.errors.push('auth');
		logger.error('handleMetrics', '400', response);
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	// Validate the body
	validateBodyIsJson(event.body);

	// Parse the body
	const body = JSON.parse(event.body as string) as {
		type: string;
		data: {
			id: string;
			val: number;
		}[];
	};
	
	// Validate the body
	if (!body.type || typeof body.type !== 'string') {
		response.errors.push('type');
	}
	if (
		!body.data ||
		!Array.isArray(body.data) ||
		body.data.filter(i => typeof i.id !== 'string' || typeof i.val !== 'number').length > 0
	) {
		response.errors.push('data');
	}

	if (response.errors.length > 0) {
		response.success = false;
		logger.error('handleMetrics', '400', response);
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	const towerMapping: { [key: string]: string } = {
		saguache: 'Saguache Tower',
		pooltable: 'Pool Table Mountain',
		alamosa: 'Alamosa',
		sanantonio: 'San Antonio Peak',
	};

	const putConfig: aws.CloudWatch.PutMetricDataInput = {
		Namespace: 'DTR Metrics',
		MetricData: body.data.map(i => ({
			MetricName: body.type,
			Dimensions: [ {
				Name: 'Tower',
				Value: towerMapping[i.id] || i.id
			} ],
			Timestamp: date,
			Unit: 'Count',
			Value: i.val
		}))
	};
	await cloudWatch.putMetricData(putConfig).promise();

	return {
		statusCode: 200,
		body: JSON.stringify(response)
	};
}

export async function main(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.debug('main', ...arguments);
	const action = event.queryStringParameters?.action || 'none';
	let result: APIGatewayProxyResult = {
		statusCode: 404,
		headers: {},
		body: JSON.stringify({
			error: true,
			message: `Invalid action '${action}'`
		})
	};

	switch (action) {
		case 'page':
		case 'dtrPage':
			result = await handlePage(event);
			break;
		case 'heartbeat':
			result = await handleHeartbeat(event);
			break;
		case 'site_status':
			result = await handleSiteStatus(event);
			break;
		case 'dtrExists':
			result = await handleDtrExists(event);
			break;
		case 'dtrExistsSingle':
			result = await handleDtrExistsSingle(event);
			break;
		case 'startTest':
			result = await handleTestState(event, true);
			break;
		case 'endTest':
			result = await handleTestState(event, false);
			break;
		case 'getTexts':
			result = await getTestTexts(event);
			break;
		case 'metric':
			result = await handleMetrics(event);
			break;
	}

	return result;
	// logger.error('main', 'Invalid Action', action);
	// return {
	// 	statusCode: 404,
	// 	headers: {},
	// 	body: JSON.stringify({
	// 		error: true,
	// 		message: `Invalid action '${action}'`
	// 	})
	// };
}
