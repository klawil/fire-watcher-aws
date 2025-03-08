import * as aws from 'aws-sdk';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getTwilioSecret, incrementMetric, parseDynamoDbAttributeMap, sendAlertMessage, validateBodyIsJson } from '../utils/general';

const metricSource = 'Infra';

const dynamodb = new aws.DynamoDB();
const sqs = new aws.SQS();
const cloudWatch = new aws.CloudWatch();

const s3Bucket = process.env.S3_BUCKET as string;
const sqsQueue = process.env.SQS_QUEUE as string;
const dtrTable = process.env.TABLE_DTR as string;
const userTable = process.env.TABLE_PHONE as string;
const textTable = process.env.TABLE_TEXT as string;
const statusTable = process.env.TABLE_STATUS as string;
const siteTable = process.env.TABLE_SITE as string;

interface GenericApiResponse {
	success: boolean;
	errors: string[];
	message?: string;
	data?: any[];
}

interface HeartbeatBody {
	code: string;
	Server: string;
	Program: string;
	IsPrimary: boolean;
	IsActive: boolean;
}

async function handlePage(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	// Validate the body
	validateBodyIsJson(event.body);

	// Parse the body
	const body = JSON.parse(event.body as string);
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
		const sqsEvent = {
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

	return {
		statusCode: response.success ? 200 : 400,
		body: JSON.stringify(response)
	};
}

async function handleHeartbeat(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
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
		await incrementMetric('Error', {
			source: metricSource,
			type: 'Invalid heartbeat'
		});
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

	return {
		statusCode: 200,
		body: JSON.stringify(response)
	};
}

interface AdjacentSitesBodyItem {
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

interface AdjacentSitesBody {
	type: 'adjacent';
	code: string;
	adjacent: ('' | AdjacentSitesBodyItem[])[]
};

const ignoreChangesInFields = [ 'ActiveConn' ];

async function handleSiteStatus(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
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
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	// Consolidate the rows
	const sites: { [key: string]: AdjacentSitesBodyItem } = {};
	body.adjacent
		.filter(sites => sites !== '')
		.forEach(sysSites => (sysSites as AdjacentSitesBodyItem[]).forEach(site => {
			const siteId = `${site.rfss}-${site.site}`;

			if (typeof sites[siteId] === 'undefined') {
				sites[siteId] = site;
				return;
			}

			sites[siteId].sys_shortname += `,${site.sys_shortname}`;
			(Object.keys(neededFields) as (keyof AdjacentSitesBodyItem)[])
				.filter(key => neededFields[key] !== 'string')
				.forEach(key => {
					(sites[siteId][key] as boolean) = (sites[siteId][key] as boolean) || (site[key] as boolean);
				});
		}));

	const updateTime = Date.now();
	await Promise.all(Object.keys(sites).map(siteId => {
		const site = sites[siteId];
		const siteValues: aws.DynamoDB.ExpressionAttributeValueMap = {
			':sys': { S: site.sys_shortname },
			':cc': { BOOL: site.conv_ch },
			':sf': { BOOL: site.site_failed },
			':vi': { BOOL: site.valid_info },
			':compc': { BOOL: site.composite_ctrl },
			':ac': { BOOL: site.active_conn },
			':bc': { BOOL: site.backup_ctrl },
			':nsr': { BOOL: site.no_service_req },
			':sd': { BOOL: site.supports_data },
			':sv': { BOOL: site.supports_voice },
			':sr': { BOOL: site.supports_registration },
			':sa': { BOOL: site.supports_authentication },
			':ut': { N: updateTime.toString() },
		};
		const siteNames: aws.DynamoDB.ExpressionAttributeNameMap = {
			'#sys': 'SysShortname',
			'#cc': 'ConvChannel',
			'#sf': 'SiteFailed',
			'#vi': 'ValidInfo',
			'#compc': 'CompositeCtrl',
			'#ac': 'ActiveConn',
			'#bc': 'BackupCtrl',
			'#nsr': 'NoServReq',
			'#sd': 'SupportData',
			'#sv': 'SupportVoice',
			'#sr': 'SupportReg',
			'#sa': 'SupportAuth',
			'#ut': 'UpdateTime',
		};
		return dynamodb.updateItem({
			TableName: siteTable,
			Key: {
				SiteId: {
					S: siteId
				}
			},
			ExpressionAttributeNames: siteNames,
			ExpressionAttributeValues: siteValues,
			UpdateExpression: 'SET #sys = :sys, #cc = :cc, #sf = :sf, #vi = :vi, #compc = :compc, #ac = :ac, #bc = :bc, #nsr = :nsr, #sd = :sd, #sv = :sv, #sr = :sr, #sa = :sa, #ut = :ut',
			ReturnValues: 'ALL_OLD'
		}).promise()
			.then(result => {
				if (!result.Attributes) return;

				const changedKeys: string[] = Object.keys(siteValues)
					.filter(k => typeof siteValues[k].BOOL !== 'undefined')
					.filter(k => ignoreChangesInFields.indexOf(siteNames[k.replace(':', '#')]) === -1)
					.filter(k =>
						result.Attributes &&
						(typeof result.Attributes[siteNames[k.replace(':', '#')]] === 'undefined' ||
						result.Attributes[siteNames[k.replace(':', '#')]].BOOL !== siteValues[k].BOOL))
					.map(k => siteNames[k.replace(':', '#')]);

				if (changedKeys.length > 0) {
					return sendAlertMessage(metricSource, `Update for site ${siteId} - ${changedKeys.join(', ')}`);
				}

				return;
			});
	}));

	return {
		statusCode: 200,
		body: JSON.stringify(response)
	};
}

async function handleDtrExists(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
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
		await incrementMetric('Error', {
			source: metricSource,
			type: 'Invalid DTR Exists'
		});
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

const testingUser = '***REMOVED***';
async function handleTestState(event: APIGatewayProxyEvent, testOn: boolean): Promise<APIGatewayProxyResult> {
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
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	// Retrieve the texts
	const result = await dynamodb.query({
		TableName: textTable,
		IndexName: 'isTestIndex',
		Limit: 10,
		ScanIndexForward: false,
		ExpressionAttributeNames: {
			'#its': 'isTestString'
		},
		ExpressionAttributeValues: {
			':its': { S: 'y' }
		},
		KeyConditionExpression: '#its = :its'
	}).promise();
	response.data = result.Items?.map(parseDynamoDbAttributeMap);

	return {
		statusCode: 200,
		headers: {},
		body: JSON.stringify(response)
	};
}

async function handleMetrics(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
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
	const action = event.queryStringParameters?.action || 'none';

	try {
		if (action !== 'metric') {
			await incrementMetric('Call', {
				source: metricSource,
				action
			}, true, false);
		}
		switch (action) {
			case 'page':
			case 'dtrPage':
				return await handlePage(event);
			case 'heartbeat':
				return await handleHeartbeat(event);
			case 'site_status':
				return await handleSiteStatus(event);
			case 'dtrExists':
				return await handleDtrExists(event);
			case 'dtrExistsSingle':
				return await handleDtrExistsSingle(event);
			case 'startTest':
				return await handleTestState(event, true);
			case 'endTest':
				return await handleTestState(event, false);
			case 'getTexts':
				return await getTestTexts(event);
			case 'metric':
				return await handleMetrics(event);
		}

		await incrementMetric('Error', {
			source: metricSource,
		type: '404'
		});
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
