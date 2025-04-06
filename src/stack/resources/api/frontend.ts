import * as aws from 'aws-sdk';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { incrementMetric, validateBodyIsJson } from '../../utils/general';
import { parseDynamoDbAttributeMap } from '../../utils/dynamodb';
import { getLoggedInUser } from '../../utils/auth';
import { ApiFrontendListTextsResponse, ApiFrontendStatsResponse, MessageType, AnnouncementApiBody, TextObject } from '../../../common/frontendApi';
import { getLogger } from '../../../logic/logger';
import { AnnounceBody } from '../types/queue';
import { pagingTalkgroups, validDepartments } from '@/types/api/users';

const logger = getLogger('frontend');

const metricSource = 'Frontend';

const dynamodb = new aws.DynamoDB();
const sqs = new aws.SQS();
const cloudWatch = new aws.CloudWatch();

const defaultListLimit = 100;

const textsTable = process.env.TABLE_TEXTS as string;
const siteTable = process.env.TABLE_SITE as string;
const sqsQueue = process.env.SQS_QUEUE as string;

const lambdaFunctionNames: { [key: string]: {
	name: string,
	fn: string,
	errName?: string,
} } = {
	S3: {
		name: 'S3 Lambda',
		fn: process.env.S3_LAMBDA as string,
		errName: 's3',
	},
	queue: {
		name: 'Queue Lambda',
		fn: process.env.QUEUE_LAMBDA as string,
		errName: 'queue',
	},
	alarmQueue: {
		name: 'Alarm Queue Lambda',
		fn: process.env.ALARM_QUEUE_LAMBDA as string,
	},
	status: {
		name: 'Status Lambda',
		fn: process.env.STATUS_LAMBDA as string,
	},
	weather: {
		name: 'Weather Lambda',
		fn: process.env.WEATHER_LAMBDA as string,
	},
	infraApi: {
		name: 'Infra API',
		fn: process.env.INFRA_API_LAMBDA as string,
		errName: 'infra',
	},
	userApi: {
		name: 'User API',
		fn: process.env.USER_API_LAMBDA as string,
		errName: 'user',
	},
	twilioApi: {
		name: 'Twilio API',
		fn: process.env.TWILIO_API_LAMBDA as string,
		errName: 'twilio',
	},
	eventsApi: {
		name: 'Events API',
		fn: process.env.EVENTS_API_LAMBDA as string,
		errName: 'events',
	},
	audioApi: {
		name: 'Audio API',
		fn: process.env.AUDIO_API_LAMBDA as string,
		errName: 'audio',
	},
	frontendApi: {
		name: 'Frontend API',
		fn: process.env.AWS_LAMBDA_FUNCTION_NAME as string,
		errName: 'frontend',
	},
};

const anyAdminTextTypes: MessageType[] = [ 'page', 'transcript', 'pageAnnounce', ];

async function getTexts(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.trace('getTexts', ...arguments);
	const unauthorizedResponse = {
		statusCode: 403,
		body: JSON.stringify({
			success: false,
			message: 'You are not permitted to access this area'
		})
	};

	const user = await getLoggedInUser(event);
	if (
		user === null ||
		!user.isAdmin
	) {
		return unauthorizedResponse;
	}

	const getPages = event.queryStringParameters?.page === 'y';
	if (
		typeof event.queryStringParameters?.before !== 'undefined' &&
		!/^[0-9]+$/.test(event.queryStringParameters.before)
	) {
		return {
			statusCode: 400,
			body: JSON.stringify({
				success: false,
				errors: [ 'before' ],
			})
		};
	}

	const queryInput: aws.DynamoDB.QueryInput & Required<Pick<aws.DynamoDB.QueryInput, 'ExpressionAttributeNames' | 'ExpressionAttributeValues' | 'KeyConditionExpression'>> = {
		TableName: textsTable,
		IndexName: 'testPageIndex',
		Limit: defaultListLimit,
		ScanIndexForward: false,
		ExpressionAttributeNames: {
			'#tpi': 'testPageIndex',
		},
		ExpressionAttributeValues: {
			':tpi': {
				S: `n${getPages ? 'y' : 'n'}`,
			},
		},
		KeyConditionExpression: '#tpi = :tpi'
	};
	if (typeof event.queryStringParameters?.before !== 'undefined') {
		queryInput.ExpressionAttributeNames['#datetime'] = 'datetime';
		queryInput.ExpressionAttributeValues[':datetime'] = { N: event.queryStringParameters.before };
		queryInput.KeyConditionExpression += ' AND #datetime < :datetime';
	}
	const result = await dynamodb.query(queryInput).promise();

	const userAdminDeparments = validDepartments
		.filter(dep => user[dep]?.active && user[dep]?.admin);

	// Filter out the texts the person does not have access to
	const data = ((result.Items?.map(parseDynamoDbAttributeMap) || []) as unknown[] as TextObject[])
		.filter(text => {
			if (text.type === 'account') return false;

			if (user.isDistrictAdmin) return true;

			if (text.recipients === 0) return false;

			if (anyAdminTextTypes.includes(text.type)) return true;

			if (typeof text.department === 'undefined') return false;

			if (userAdminDeparments.includes(text.department)) return true;

			return false;
		});

	const responseBody: ApiFrontendListTextsResponse = {
		success: true,
		count: result.Count,
		scanned: result.ScannedCount,
		data,
	}
	return {
		statusCode: 200,
		headers: {},
		body: JSON.stringify(responseBody),
	};
}

async function sendAnnouncement(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.trace('sendText', ...arguments);
	const unauthorizedResponse = {
		statusCode: 403,
		body: JSON.stringify({
			success: false,
			message: 'You are not permitted to access this area'
		})
	};

	// Get the current user
	const user = await getLoggedInUser(event);
	if (
		user === null ||
		!user.isAdmin
	) {
		return unauthorizedResponse;
	}

	// Validate the body
	validateBodyIsJson(event.body);
	const body = JSON.parse(event.body as string) as AnnouncementApiBody;
	const response: GenericApiResponse = {
		success: true,
		errors: [],
	};

	// Validate the body
	if (
		typeof body.body !== 'string' ||
		body.body === '' ||
		body.body.length > 1250
	) {
		response.errors.push('body');
	}
	if (
		typeof body.department !== 'undefined' &&
		!validDepartments.includes(body.department)
	) {
		response.errors.push('department');
	}
	if (
		typeof body.talkgroup !== 'undefined' &&
		!pagingTalkgroups.includes(body.talkgroup)
	) {
		response.errors.push('talkgroup');
	}
	if (
		response.errors.length === 0 &&
		typeof body.department === 'undefined' &&
		typeof body.talkgroup === 'undefined'
	) {
		response.errors.push('department', 'talkgroup');
	}
	if (
		response.errors.length === 0 &&
		typeof body.department !== 'undefined' &&
		typeof body.talkgroup !== 'undefined'
	) {
		response.errors.push('department', 'talkgroup');
	}
	if (
		response.errors.length === 0 &&
		typeof body.talkgroup !== 'undefined' &&
		!user.isDistrictAdmin
	) {
		return unauthorizedResponse;
	}

	// Return validation errors
	if (response.errors.length > 0) {
		response.success = false;
		return {
			statusCode: 400,
			body: JSON.stringify(response),
		};
	}

	// Check to make sure the user can send a text to the given department
	if (
		typeof body.department !== 'undefined' &&
		!user.isDistrictAdmin &&
		!user[body.department]?.active
	) {
		return unauthorizedResponse;
	}

	const queueMessage: AnnounceBody = {
		action: 'announce',
		phone: user.phone.toString(),
		body: body.body,
		isTest: body.test === true,
		department: body.department,
		talkgroup: body.talkgroup,
	};
	await sqs.sendMessage({
		MessageBody: JSON.stringify(queueMessage),
		QueueUrl: sqsQueue,
	}).promise();

	return {
		statusCode: 200,
		body: JSON.stringify(response),
	};
}

interface GenericApiResponse {
	success: boolean;
	errors: string[];
	message?: string;
	data?: unknown[] | unknown;
}

async function handlePageView(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.trace('handlePageView', ...arguments);
	const date = new Date();
	const response: GenericApiResponse = {
		success: true,
		errors: []
	};

	// Validate the body
	validateBodyIsJson(event.body);

	// Parse the body
	const body = JSON.parse(event.body as string) as {
		cs: string;
		f: string;
	};

	// Validate the body
	if (!body.cs || typeof body.cs !== 'string') {
		response.errors.push('cs');
	}
	if (!body.f || typeof body.f !== 'string') {
		response.errors.push('f');
	}

	if (response.errors.length > 0) {
		response.success = false;
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	const result = await dynamodb.query({
		TableName: textsTable,
		IndexName: 'testPageIndex',
		ExpressionAttributeNames: {
			'#tpi': 'testPageIndex',
			'#pid': 'pageId',
			'#type': 'type',
		},
		ExpressionAttributeValues: {
			':pid': {
				S: body.f
			},
			':tpi': {
				S: 'ny'
			},
			':type': {
				S: 'page',
			},
		},
		KeyConditionExpression: '#tpi = :tpi',
		FilterExpression: '#pid = :pid AND #type = :type',
		ScanIndexForward: false
	}).promise();
	if (!result.Items || result.Items.length === 0) {
		response.errors.push(`"f" is not a valid key`);
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	if (
		result.Items[0].csLooked &&
		result.Items[0].csLooked.SS &&
		result.Items[0].csLooked.SS.indexOf(`${body.cs}`) !== -1
	) {
		response.data = [ 'Done already' ];
		return {
			statusCode: 200,
			body: JSON.stringify(response)
		};
	}

	// Update the item
	let updateExpression = 'ADD #csLooked :csLooked, #csLookedTime :csLookedTime';
	if (!result.Items[0].csLooked) {
		updateExpression = 'SET #csLooked = :csLooked, #csLookedTime = :csLookedTime';
	}
	await dynamodb.updateItem({
		TableName: textsTable,
		Key: {
			datetime: result.Items[0].datetime
		},
		ExpressionAttributeNames: {
			'#csLooked': 'csLooked',
			'#csLookedTime': 'csLookedTime'
		},
		ExpressionAttributeValues: {
			':csLooked': {
				SS: [
					`${body.cs}`
				]
			},
			':csLookedTime': {
				NS: [
					`${date.getTime()}`
				]
			}
		},
		UpdateExpression: updateExpression
	}).promise();

	return {
		statusCode: 200,
		body: JSON.stringify(response)
	};
}

const statsMap: {
	[key: string]: Omit<aws.CloudWatch.MetricDataQuery, "Id">,
} = {
	's3-dtr': {
		Label: 'DTR Files Uploaded',
		MetricStat: {
			Metric: {
				Namespace: 'CVFD API',
				MetricName: 'Call',
				Dimensions: [
					{
						Name: 'source',
						Value: 'S3'
					},
					{
						Name: 'action',
						Value: 'createDTR'
					}
				]
			},
			Period: 60,
			Stat: 'Sum',
			Unit: 'Count'
		}
	},
	's3-dtr-dup': {
		Label: 'Duplicate DTR Files Uploaded',
		MetricStat: {
			Metric: {
				Namespace: 'CVFD API',
				MetricName: 'Event',
				Dimensions: [
					{
						Name: 'source',
						Value: 'S3'
					},
					{
						Name: 'event',
						Value: 'duplicate call'
					},
					{
						Name: 'type',
						Value: 'dtr'
					}
				]
			},
			Period: 60,
			Stat: 'Sum',
			Unit: 'Count'
		}
	},
	's3-dtr-uniq': {
		Label: 'Unique DTR Files Uploaded',
		Expression: 's3_dtr-s3_dtr_dup'
	},
	's3-vhf': {
		Label: 'VHF Files Uploaded',
		MetricStat: {
			Metric: {
				Namespace: 'CVFD API',
				MetricName: 'Call',
				Dimensions: [
					{
						Name: 'source',
						Value: 'S3'
					},
					{
						Name: 'action',
						Value: 'createVHF'
					}
				]
			},
			Period: 60,
			Stat: 'Sum',
			Unit: 'Count'
		}
	},
	's3-created': {
		Label: 'S3 Files Created',
		Expression: 's3_dtr+s3_vhf-s3_dtr_dup'
	},
	'err-frontend': {
		Label: 'Frontend API Errors',
		MetricStat: {
			Metric: {
				Namespace: 'CVFD API',
				MetricName: 'Error',
				Dimensions: [
					{
						Name: 'source',
						Value: 'Frontend'
					}
				]
			},
			Period: 60,
			Stat: 'Sum',
			Unit: 'Count'
		}
	},
	'err-infra': {
		Label: 'Infrastructure API Errors',
		MetricStat: {
			Metric: {
				Namespace: 'CVFD API',
				MetricName: 'Error',
				Dimensions: [
					{
						Name: 'source',
						Value: 'Infra'
					}
				]
			},
			Period: 60,
			Stat: 'Sum',
			Unit: 'Count'
		}
	},
	'err-user': {
		Label: 'User API Errors',
		MetricStat: {
			Metric: {
				Namespace: 'CVFD API',
				MetricName: 'Error',
				Dimensions: [
					{
						Name: 'source',
						Value: 'User'
					}
				]
			},
			Period: 60,
			Stat: 'Sum',
			Unit: 'Count'
		}
	},
	'err-twilio': {
		Label: 'Twilio API Errors',
		MetricStat: {
			Metric: {
				Namespace: 'CVFD API',
				MetricName: 'Error',
				Dimensions: [
					{
						Name: 'source',
						Value: 'Twilio'
					}
				]
			},
			Period: 60,
			Stat: 'Sum',
			Unit: 'Count'
		}
	},
	'err-events': {
		Label: 'Event API Errors',
		MetricStat: {
			Metric: {
				Namespace: 'CVFD API',
				MetricName: 'Error',
				Dimensions: [
					{
						Name: 'source',
						Value: 'Events'
					}
				]
			},
			Period: 60,
			Stat: 'Sum',
			Unit: 'Count'
		}
	},
	'err-audio': {
		Label: 'Audio API Errors',
		MetricStat: {
			Metric: {
				Namespace: 'CVFD API',
				MetricName: 'Error',
				Dimensions: [
					{
						Name: 'source',
						Value: 'Audio'
					}
				]
			},
			Period: 60,
			Stat: 'Sum',
			Unit: 'Count'
		}
	},
	'err-s3': {
		Label: 'S3 Event Errors',
		MetricStat: {
			Metric: {
				Namespace: 'CVFD API',
				MetricName: 'Error',
				Dimensions: [
					{
						Name: 'source',
						Value: 'S3'
					}
				]
			},
			Period: 60,
			Stat: 'Sum',
			Unit: 'Count'
		}
	},
	'err-queue': {
		Label: 'Queue Event Errors',
		MetricStat: {
			Metric: {
				Namespace: 'CVFD API',
				MetricName: 'Error',
				Dimensions: [
					{
						Name: 'source',
						Value: 'Queue'
					}
				]
			},
			Period: 60,
			Stat: 'Sum',
			Unit: 'Count'
		}
	},
	'tower-sag-min': {
		Label: 'Saguache Tower Decode Rate - Min',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'Decode Rate',
				Dimensions: [
					{
						Name: 'Tower',
						Value: 'Saguache'
					}
				]
			},
			Period: 60,
			Stat: 'Minimum',
			Unit: 'Count'
		}
	},
	'tower-sag-max': {
		Label: 'Saguache Tower Decode Rate - Max',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'Decode Rate',
				Dimensions: [
					{
						Name: 'Tower',
						Value: 'Saguache'
					}
				]
			},
			Period: 60,
			Stat: 'Maximum',
			Unit: 'Count'
		}
	},
	'tower-sag-upload': {
		Label: 'Saguache Tower Uploads',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'Upload',
				Dimensions: [ {
					Name: 'Tower',
					Value: 'Saguache'
				} ]
			},
			Period: 60,
			Stat: 'Sum',
			Unit: 'Count'
		}
	},
	'tower-ala-min': {
		Label: 'Alamosa Tower Decode Rate - Min',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'Decode Rate',
				Dimensions: [
					{
						Name: 'Tower',
						Value: 'Alamosa'
					}
				]
			},
			Period: 60,
			Stat: 'Minimum',
			Unit: 'Count'
		}
	},
	'tower-ala-max': {
		Label: 'Alamosa Tower Decode Rate - Max',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'Decode Rate',
				Dimensions: [
					{
						Name: 'Tower',
						Value: 'Alamosa'
					}
				]
			},
			Period: 60,
			Stat: 'Maximum',
			Unit: 'Count'
		}
	},
	'tower-ala-upload': {
		Label: 'Alamosa Tower Uploads',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'Upload',
				Dimensions: [ {
					Name: 'Tower',
					Value: 'Alamosa'
				} ]
			},
			Period: 60,
			Stat: 'Sum',
			Unit: 'Count'
		}
	},
	'tower-pt-min': {
		Label: 'Pool Table Tower Decode Rate - Min',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'Decode Rate',
				Dimensions: [
					{
						Name: 'Tower',
						Value: 'PoolTable'
					}
				]
			},
			Period: 60,
			Stat: 'Minimum',
			Unit: 'Count'
		}
	},
	'tower-pt-max': {
		Label: 'Pool Table Tower Decode Rate - Max',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'Decode Rate',
				Dimensions: [
					{
						Name: 'Tower',
						Value: 'PoolTable'
					}
				]
			},
			Period: 60,
			Stat: 'Maximum',
			Unit: 'Count'
		}
	},
	'tower-pt-upload': {
		Label: 'Pool Table Uploads',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'Upload',
				Dimensions: [ {
					Name: 'Tower',
					Value: 'PoolTable'
				} ]
			},
			Period: 60,
			Stat: 'Sum',
			Unit: 'Count'
		}
	},
	'tower-sa-min': {
		Label: 'San Antonio Peak Decode Rate - Min',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'Decode Rate',
				Dimensions: [
					{
						Name: 'Tower',
						Value: 'SanAntonio'
					}
				]
			},
			Period: 60,
			Stat: 'Minimum',
			Unit: 'Count'
		}
	},
	'tower-sa-max': {
		Label: 'San Antonio Peak Decode Rate - Max',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'Decode Rate',
				Dimensions: [
					{
						Name: 'Tower',
						Value: 'SanAntonio'
					}
				]
			},
			Period: 60,
			Stat: 'Maximum',
			Unit: 'Count'
		}
	},
	'tower-sa-upload': {
		Label: 'San Antonio Peak Uploads',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'Upload',
				Dimensions: [ {
					Name: 'Tower',
					Value: 'SanAntonio'
				} ]
			},
			Period: 60,
			Stat: 'Sum',
			Unit: 'Count'
		}
	},
	'tower-mv-min': {
		Label: 'Monte Vista Tower Decode Rate - Min',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'Decode Rate',
				Dimensions: [
					{
						Name: 'Tower',
						Value: 'Monte Vista Tower'
					}
				]
			},
			Period: 60,
			Stat: 'Minimum',
			Unit: 'Count'
		}
	},
	'tower-mv-max': {
		Label: 'Monte Vista Tower Decode Rate - Max',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'Decode Rate',
				Dimensions: [
					{
						Name: 'Tower',
						Value: 'Monte Vista Tower'
					}
				]
			},
			Period: 60,
			Stat: 'Maximum',
			Unit: 'Count'
		}
	},
	'tower-mv-upload': {
		Label: 'Monte Vista Tower Uploads',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'Upload',
				Dimensions: [ {
					Name: 'Tower',
					Value: 'monte'
				} ]
			},
			Period: 60,
			Stat: 'Sum',
			Unit: 'Count'
		}
	},
	'twilio-init': {
		Label: 'Texts Initiated',
		MetricStat: {
			Metric: {
				Namespace: 'Twilio Health',
				MetricName: 'Initiated'
			},
			Period: 60,
			Stat: 'Sum',
			Unit: 'Count'
		}
	},
	'twilio-sent': {
		Label: 'Texts Sent',
		MetricStat: {
			Metric: {
				Namespace: 'Twilio Health',
				MetricName: 'Sent'
			},
			Period: 60,
			Stat: 'Sum',
			Unit: 'Count'
		}
	},
	'twilio-delivered': {
		Label: 'Texts Delivered',
		MetricStat: {
			Metric: {
				Namespace: 'Twilio Health',
				MetricName: 'Delivered'
			},
			Period: 60,
			Stat: 'Sum',
			Unit: 'Count'
		}
	},
	'twilio-sent-percent': {
		Label: '% Texts Sent',
		Expression: 'FLOOR(100*(twilio-sent/twilio-init))'
	},
	'twilio-delivered-percent': {
		Label: '% Texts Delivered',
		Expression: 'FLOOR(100*(twilio-delivered/twilio-init))'
	},
	'twilio-sent-time': {
		Label: 'Time to Send Texts',
		MetricStat: {
			Metric: {
				Namespace: 'Twilio Health',
				MetricName: 'SentTime'
			},
			Period: 60,
			Stat: 'p80'
		}
	},
	'twilio-delivered-time': {
		Label: 'Time to Deliver Texts',
		MetricStat: {
			Metric: {
				Namespace: 'Twilio Health',
				MetricName: 'DeliveredTime'
			},
			Period: 60,
			Stat: 'p80'
		}
	},
	'twilio-page-duration': {
		Label: 'Duration of Page',
		MetricStat: {
			Metric: {
				Namespace: 'Twilio Health',
				MetricName: 'PageDuration'
			},
			Period: 60,
			Stat: 'p80'
		}
	},
	'twilio-page-time': {
		Label: 'Time to Send Page',
		MetricStat: {
			Metric: {
				Namespace: 'Twilio Health',
				MetricName: 'PageToQueue'
			},
			Period: 60,
			Stat: 'p80'
		}
	},
	'twilio-delivered-sent-time': {
		Label: 'Time To Deliver Texts',
		Expression: 'twilio_delivered_time-twilio_sent_time'
	},
	'status-120-home': {
		Label: 'Home VHF Heartbeats',
		MetricStat: {
			Metric: {
				Namespace: 'VHF Metrics',
				MetricName: '120-home',
			},
			Period: 60,
			Stat: 'Sum',
		},
	},
	'status-cvfd-station': {
		Label: 'CVFD VHF Heartbeats',
		MetricStat: {
			Metric: {
				Namespace: 'VHF Metrics',
				MetricName: 'cvfd-station',
			},
			Period: 60,
			Stat: 'Sum',
		},
	},
	'upload-time-cvfd-min': {
		Label: 'CVFD Upload Time (min)',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'UploadTime',
				Dimensions: [
					{
						Name: 'Tower',
						Value: 'CVFD',
					},
				],
			},
			Period: 60,
			Stat: 'Minimum',
		},
	},
	'upload-time-cvfd-med': {
		Label: 'CVFD Upload Time (med)',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'UploadTime',
				Dimensions: [
					{
						Name: 'Tower',
						Value: 'CVFD',
					},
				],
			},
			Period: 60,
			Stat: 'p50',
		},
	},
	'upload-time-cvfd-avg': {
		Label: 'CVFD Upload Time (avg)',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'UploadTime',
				Dimensions: [
					{
						Name: 'Tower',
						Value: 'CVFD',
					},
				],
			},
			Period: 60,
			Stat: 'avg',
		},
	},
	'upload-time-cvfd-max': {
		Label: 'CVFD Upload Time (max)',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'UploadTime',
				Dimensions: [
					{
						Name: 'Tower',
						Value: 'CVFD',
					},
				],
			},
			Period: 60,
			Stat: 'Maximum',
		},
	},
	'upload-time-nscad-min': {
		Label: 'NSCAD Upload Time (min)',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'UploadTime',
				Dimensions: [
					{
						Name: 'Tower',
						Value: 'NSCAD',
					},
				],
			},
			Period: 60,
			Stat: 'Minimum',
		},
	},
	'upload-time-nscad-med': {
		Label: 'NSCAD Upload Time (med)',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'UploadTime',
				Dimensions: [
					{
						Name: 'Tower',
						Value: 'NSCAD',
					},
				],
			},
			Period: 60,
			Stat: 'p50',
		},
	},
	'upload-time-nscad-p80': {
		Label: 'NSCAD Upload Time (p80)',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'UploadTime',
				Dimensions: [
					{
						Name: 'Tower',
						Value: 'NSCAD',
					},
				],
			},
			Period: 60,
			Stat: 'p80',
		},
	},
	'upload-time-nscad-max': {
		Label: 'NSCAD Upload Time (max)',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'UploadTime',
				Dimensions: [
					{
						Name: 'Tower',
						Value: 'NSCAD',
					},
				],
			},
			Period: 60,
			Stat: 'Maximum',
		},
	},
};
Object.keys(lambdaFunctionNames).forEach(lambdaFn => {
	const baseId = lambdaFn.toLowerCase();
	const {name, fn: fnName, errName } = lambdaFunctionNames[lambdaFn];
	statsMap[`${baseId}-call`] = {
		Label: `${name} Calls`,
		MetricStat: {
			Metric: {
				Namespace: 'AWS/Lambda',
				MetricName: 'Invocations',
				Dimensions: [
					{
						Name: 'FunctionName',
						Value: fnName,
					},
				],
			},
			Period: 60,
			Stat: 'Sum',
			Unit: 'Count',
		},
	};
	statsMap[`${baseId}-err`] = {
		Label: `${name} Errors`,
		MetricStat: {
			Metric: {
				Namespace: 'AWS/Lambda',
				MetricName: 'Errors',
				Dimensions: [
					{
						Name: 'FunctionName',
						Value: fnName,
					},
				],
			},
			Period: 60,
			Stat: 'Sum',
			Unit: 'Count',
		},
	};
	if (typeof errName === 'string')
		statsMap[`${baseId}-err-all`] = {
			Label: `${name} Errors`,
			Expression: `${baseId}_err+err_${errName}`,
		};
	statsMap[`${baseId}-dur`] = {
		Label: `${name} Duration`,
		MetricStat: {
			Metric: {
				Namespace: 'AWS/Lambda',
				MetricName: 'Duration',
				Dimensions: [
					{
						Name: 'FunctionName',
						Value: fnName,
					},
				],
			},
			Period: 60,
			Stat: 'p50',
			Unit: 'Milliseconds',
		},
	};
	statsMap[`${baseId}-dur-max`] = {
		Label: `${name} Max Duration`,
		MetricStat: {
			Metric: {
				Namespace: 'AWS/Lambda',
				MetricName: 'Duration',
				Dimensions: [
					{
						Name: 'FunctionName',
						Value: fnName,
					},
				],
			},
			Period: 60,
			Stat: 'Maximum',
			Unit: 'Milliseconds',
		},
	};
});

const periodToTime: {
	period: number; // seconds
	timerange: number; // milliseconds
}[] = [
	{
		timerange: 365 * 24 * 60 * 60 * 1000, // 365 days (1 year)
		period: 24 * 60 * 60 // 24 hours
	},
	{
		timerange: 28 * 24 * 60 * 60 * 1000, // 28 days (1 month)
		period: 6 * 60 * 60 // 6 hours
	},
	{
		timerange: 7 * 24 * 60 * 60 * 1000, // 7 days
		period: 60 * 60 // 1 hour
	},
	{
		timerange: 24 * 60 * 60 * 1000, // 24 hours
		period: 15 * 60 // 15 minutes
	},
	{
		timerange: 6 * 60 * 60 * 1000, // 6 hours
		period: 5 * 60 // 5 minutes
	},
	{
		timerange: 60 * 60 * 1000, // 1 hour
		period: 60 // 1 minute
	},
];

async function getStats(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.trace('getStats', ...arguments);
	const unauthorizedResponse = {
		statusCode: 403,
		body: JSON.stringify({
			success: false,
			message: 'You are not permitted to access this area'
		})
	};

	const user = await getLoggedInUser(event);
	if (
		user === null ||
		!user.isAdmin
	) {
		return unauthorizedResponse;
	}

	let response: ApiFrontendStatsResponse = {
		success: false,
		errors: [],
		message: '',
	};

	event.queryStringParameters = event.queryStringParameters || {};
	const numberRegex = /^[0-9]+$/;
	const metricSplitRegex = /[^a-zA-Z0-9_]+/;

	// Validate the query
	if (
		typeof event.queryStringParameters.startTime !== 'undefined' &&
		!numberRegex.test(event.queryStringParameters.startTime)
	) {
		response.errors.push('startTime');
	}
	if (
		typeof event.queryStringParameters.endTime !== 'undefined' &&
		!numberRegex.test(event.queryStringParameters.endTime)
	) {
		response.errors.push('endTime');
	}
	if (
		typeof event.queryStringParameters.period !== 'undefined' &&
		!numberRegex.test(event.queryStringParameters.period)
	) {
		response.errors.push('period');
	}
	if (
		typeof event.queryStringParameters.timerange !== 'undefined' &&
		!numberRegex.test(event.queryStringParameters.timerange)
	) {
		response.errors.push('timerange');
	}
	if (
		typeof event.queryStringParameters.live !== 'undefined' &&
		['y', 'n'].indexOf(event.queryStringParameters.live) === -1
	) {
		response.errors.push('live');
	}
	if (typeof event.queryStringParameters.metrics !== 'string') {
		response.errors.push('metrics');
	} else if (
		event.queryStringParameters.metrics.split(',')
			.filter(v => typeof statsMap[v] === 'undefined')
			.length > 0
	) {
		response.errors.push('metrics');
	}
	if (
		typeof event.queryStringParameters.stat !== 'undefined' &&
		typeof event.queryStringParameters.stat !== 'string'
	) {
		response.errors.push('stat');
	}

	if (response.errors.length > 0) {
		response.success = false;
		return {
			statusCode: 400,
			body: JSON.stringify(response)
		};
	}

	// Get the timezone
	const nowDate = new Date();
	const timeZoneOffset = ((new Date(nowDate.toLocaleString('en-US', { timeZone: 'America/Denver' })).getTime()) -
	(new Date(nowDate.toLocaleString('en-US', { timeZone: 'UTC' })).getTime()));
	const timeZoneHourOffset = timeZoneOffset / 6e4;
	const timeZoneStr = `${timeZoneHourOffset > 0 ? '+' : '-'}${Math.abs(timeZoneHourOffset / 60).toString().padStart(2, '0')}00`;

	// Check for only timerange and set the period if it is present
	if (
		typeof event.queryStringParameters.timerange !== 'undefined' &&
		typeof event.queryStringParameters.period === 'undefined'
	) {
		const timerange = Number(event.queryStringParameters.timerange);
		const period = periodToTime
			.reduce((period, item) => {
				if (timerange <= item.timerange) return item.period;

				return period;
			}, periodToTime[0].period);
		event.queryStringParameters.period = `${period}`;
	}

	// Build the defaults
	const dir = event.queryStringParameters.live === 'y'
		? 'ceil'
		: 'floor';
	const defaultPeriod = 60 * 60;
	const defaultTimeRange = periodToTime
		.reduce((timerange, item) => {
			if (defaultPeriod <= item.period) return item.timerange;

			return timerange;
		}, periodToTime[0].timerange);
	if (
		typeof event.queryStringParameters.startTime === 'undefined' &&
		typeof event.queryStringParameters.endTime === 'undefined' &&
		typeof event.queryStringParameters.period === 'undefined'
	) {
		const nowHour = Math[dir]((Date.now() + timeZoneOffset) / (1000 * 60 * 60)) * 1000 * 60 * 60 - timeZoneOffset;
		event.queryStringParameters.startTime = `${nowHour - (1000 * 60 * 60 * 24)}`;
		event.queryStringParameters.endTime = `${nowHour}`;
		event.queryStringParameters.period = `3600`;
	} else if (
		typeof event.queryStringParameters.period !== 'undefined' && (
			typeof event.queryStringParameters.startTime === 'undefined' ||
			typeof event.queryStringParameters.endTime === 'undefined'
		)
	) {
		const period = Number(event.queryStringParameters.period);
		
		let timerange = Number(event.queryStringParameters.timerange);
		if (typeof event.queryStringParameters.timerange === 'undefined') {
			timerange = periodToTime
				.reduce((timerange, item) => {
					if (period <= item.period) return item.timerange;

					return timerange;
				}, periodToTime[0].timerange);
		}

		if (typeof event.queryStringParameters.startTime !== 'undefined') {
			event.queryStringParameters.endTime = `${Number(event.queryStringParameters.startTime) + timerange}`;
		} else if (typeof event.queryStringParameters.endTime !== 'undefined') {
			event.queryStringParameters.startTime = `${Number(event.queryStringParameters.endTime) - timerange}`;
		} else {
			const nowTime = Math[dir]((Date.now() + timeZoneOffset) / (period * 1000)) * period * 1000 - timeZoneOffset;
			event.queryStringParameters.endTime = `${nowTime}`;
			event.queryStringParameters.startTime = `${nowTime - timerange}`;
		}
	} else if (
		typeof event.queryStringParameters.period === 'undefined' &&
		(
			typeof event.queryStringParameters.startTime !== 'undefined' ||
			typeof event.queryStringParameters.endTime !== 'undefined'
		)
	) {
		let timerange = 0;
		if (
			typeof event.queryStringParameters.startTime === 'undefined' ||
			typeof event.queryStringParameters.endTime === 'undefined'
		) {
			timerange = defaultTimeRange;
		} else {
			timerange = Number(event.queryStringParameters.endTime) - Number(event.queryStringParameters.startTime);
		}

		const period = periodToTime
			.reduce((period, item) => {
				if (timerange <= item.timerange) return item.period;

				return period;
			}, periodToTime[0].period);
		event.queryStringParameters.period = `${period}`;

		if (typeof event.queryStringParameters.startTime === 'undefined') {
			event.queryStringParameters.startTime = `${Number(event.queryStringParameters.endTime) - timerange}`;
		} else if (typeof event.queryStringParameters.endTime === 'undefined') {
			event.queryStringParameters.endTime = `${Number(event.queryStringParameters.startTime) + timerange}`;
		}
	}

	// Build the metrics request
	const metricsToInclude = (event.queryStringParameters.metrics || '').split(',');
	const stat = event.queryStringParameters.stat || null;
	const metricRequest: aws.CloudWatch.GetMetricDataInput = {
		EndTime: new Date(Number(event.queryStringParameters.endTime)),
		StartTime: new Date(Number(event.queryStringParameters.startTime)),
		ScanBy: 'TimestampDescending',
		LabelOptions: {
			Timezone: timeZoneStr
		},
		MetricDataQueries: metricsToInclude
			.map(key => {
				const metricToPush = {
					...statsMap[key],
					Id: key.replace(/-/g, '_'),
					ReturnData: true
				};
				if (metricToPush.MetricStat) {
					metricToPush.MetricStat = {
						...metricToPush.MetricStat,
						Period: Number(event.queryStringParameters?.period)
					};

					if (stat !== null) {
						metricToPush.MetricStat.Stat = stat;
					}
				} else {
					metricToPush.Period = Number(event.queryStringParameters?.period);
				}

				return metricToPush;
			})
	};
	metricRequest.MetricDataQueries
		.filter(metric => typeof metric.Expression !== 'undefined')
		.forEach(metric => metric.Expression?.split(metricSplitRegex)
			.filter((v, i, a) => a.indexOf(v) === i)
			.map(key => key.replace(/_/g, '-'))
			.filter(v =>
				v !== '' &&
				metricsToInclude.indexOf(v) === -1 &&
				typeof statsMap[v] !== 'undefined'
			)
			.forEach(key => {
				metricsToInclude.push(key);
				const metricToPush = {
					...statsMap[key],
					Id: key.replace(/-/g, '_'),
					ReturnData: false
				};
				if (metricToPush.MetricStat) {
					metricToPush.MetricStat = {
						...metricToPush.MetricStat,
						Period: Number(event.queryStringParameters?.period)
					};

					if (stat !== null) {
						metricToPush.MetricStat.Stat = stat;
					}
				} else {
					metricToPush.Period = Number(event.queryStringParameters?.period);
				}
				metricRequest.MetricDataQueries.push(metricToPush);
			})
		);


	try {
		response = {
			success: true,
			errors: [],
			metrics: metricsToInclude,
			startTime: Number(event.queryStringParameters.startTime),
			endTime: Number(event.queryStringParameters.endTime),
			period: Number(event.queryStringParameters.period),
			data: await cloudWatch.getMetricData(metricRequest).promise()
				.then(response => {
					if (typeof response.MetricDataResults === 'undefined')
						return {
							names: {},
							data: [],
						};

					const metrics: {
						names: {
							[key: string]: string;
						},
						data: {
							ts: string;
							values: {
								[key: string]: number;
							};
						}[];
					} = {
						names: {},
						data: []
					};

					metrics.names = response.MetricDataResults
						.reduce((agg: { [key: string]: string }, item) => {
							agg[item.Id || 'ERR'] = item.Label || '';

							return agg;
						}, {});

					metrics.data = response.MetricDataResults
						.reduce((
							agg: { ts: string; values: { [key: string]: number; } }[],
							item
						) => {
							item.Timestamps?.forEach((ts, index) => {
								let isFound = false;
								const tsString = ts.toISOString();
								const id = item.Id || '';
								const val = typeof item.Values !== 'undefined' ? item.Values[index] || 0 : 0;
								for (let i = 0; i < agg.length; i++) {
									if (agg[i].ts === tsString) {
										isFound = true;
										agg[i].values[id] = val;
										break;
									}
								}
								if (!isFound) {
									agg.push({
										ts: tsString,
										values: {
											[id]: val
										}
									})
								}
							});

							return agg;
						}, []);

					return metrics;
				})
			};
		} catch (e) {
			response.success = false;
			response.errors.push((<Error>e).message);
		}

	return {
		statusCode: 200,
		body: JSON.stringify(response)
	};
}

async function getSites(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.trace('getSites', ...arguments);
	const unauthorizedResponse = {
		statusCode: 403,
		body: JSON.stringify({
			success: false,
			message: 'You are not permitted to access this area'
		})
	};

	const user = await getLoggedInUser(event);
	if (
		user === null ||
		!user.isAdmin
	) {
		return unauthorizedResponse;
	}

	const response: GenericApiResponse = {
		success: true,
		errors: [],
		data: []
	};

	// Get the sites
	const results = await dynamodb.query({
		TableName: siteTable,
		IndexName: 'active',
		ExpressionAttributeNames: { '#ia': 'IsActive' },
		ExpressionAttributeValues: { ':ia': { S: 'y' } },
		KeyConditionExpression: '#ia = :ia'
	}).promise();

	if (results.Items) {
		response.data = results.Items.map(parseDynamoDbAttributeMap);
	}

	return {
		statusCode: response.success ? 200 : 400,
		body: JSON.stringify(response)
	};
}

export async function main(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.debug('main', ...arguments);
	const action = event.queryStringParameters?.action || 'none';
	try {
		switch (action) {
			case 'listTexts':
				return await getTexts(event);
			case 'pageView':
				return await handlePageView(event);
			case 'stats':
				return await getStats(event);
			case 'sites':
				return await getSites(event);
			case 'announce':
				return await sendAnnouncement(event);
		}

		logger.error('main', 'Invalid action', action);
		return {
			statusCode: 404,
			headers: {},
			body: JSON.stringify({
				error: true,
				message: `Invalid action '${action}'`
			})
		}
	} catch (e) {
		await incrementMetric('Error', {
			source: metricSource,
			type: 'Thrown exception'
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
