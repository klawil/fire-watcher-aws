import * as aws from 'aws-sdk';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { incrementMetric, parseDynamoDbAttributeMap, validateBodyIsJson } from '../utils/general';
import { getLoggedInUser } from '../utils/auth';

const metricSource = 'Frontend';

const dynamodb = new aws.DynamoDB();
const cloudWatch = new aws.CloudWatch();

const defaultListLimit = 100;

const dtrTable = process.env.TABLE_DTR as string;
const talkgroupTable = process.env.TABLE_TALKGROUP as string;
const textsTable = process.env.TABLE_TEXTS as string;

const dtrTableIndexes: {
	[key: string]: undefined | string;
} = {
	StartTimeEmergIndex: 'AddedIndex',
	StartTimeTgIndex: undefined
};

interface QueryInputWithAttributes extends aws.DynamoDB.QueryInput {
	ExpressionAttributeValues: aws.DynamoDB.ExpressionAttributeValueMap;
	ExpressionAttributeNames: aws.DynamoDB.ExpressionAttributeNameMap;
}

interface DynamoListOutput extends aws.DynamoDB.QueryOutput {
	Items: aws.DynamoDB.ItemList;
	Count: number;
	ScannedCount: number;
	LastEvaluatedKeys: (aws.DynamoDB.Key | null)[];
	MinSortKey: number | null;
	MaxSortKey: number | null;
}

async function mergeDynamoQueries(
	queryConfigs: aws.DynamoDB.QueryInput[],
	sortKey: string,
	afterKey: string = ''
): Promise<DynamoListOutput> {
	if (afterKey === '') {
		afterKey = sortKey;
	}

	const scanForward = queryConfigs[0].ScanIndexForward;
	const sortDirGreater = scanForward ? 1 : -1;
	const sortDirLesser = scanForward ? -1 : 1;

	return await Promise.all(queryConfigs.map(queryConfig => dynamodb.query(queryConfig).promise()))
		.then(data => data.reduce((agg: DynamoListOutput, result) => {
			if (typeof result.Count !== 'undefined')
				agg.Count += result.Count;

			if (typeof result.ScannedCount !== 'undefined')
				agg.ScannedCount += result.ScannedCount;

			if (typeof result.Items !== 'undefined')
				agg.Items = [
					...agg.Items,
					...result.Items
				];

			agg.LastEvaluatedKeys.push(result.LastEvaluatedKey || null);

			return agg;
		}, {
			Items: [],
			Count: 0,
			ScannedCount: 0,
			LastEvaluatedKeys: [],
			MinSortKey: null,
			MaxSortKey: null
		}))
		.then(data => {
			data.Items = data.Items.sort((a, b) => {
				if (typeof b[sortKey].N === 'undefined')
					return sortDirGreater;

				if (
					typeof a[sortKey].N === 'undefined'
				) return sortDirLesser;

				return Number(a[sortKey].N) > Number(b[sortKey].N)
					? sortDirGreater
					: sortDirLesser;
			});

			if (typeof queryConfigs[0].Limit !== 'undefined') {
				data.Items = data.Items.slice(0, queryConfigs[0].Limit);
				data.Count = data.Items.length;
			}

			let minSortKey: null | number = null;
			let maxSortKey: null | number = null;
			data.Items.forEach(item => {
				const sortKeyValue = Number(item[sortKey]?.N);
				const afterKeyValue = Number(item[afterKey]?.N);

				if (
					!isNaN(sortKeyValue) &&
					(
						minSortKey === null ||
						sortKeyValue < minSortKey
					)
				)
					minSortKey = sortKeyValue;

				if (
					!isNaN(afterKeyValue) &&
					(
						maxSortKey === null ||
						afterKeyValue > maxSortKey
					)
				)
					maxSortKey = afterKeyValue;
			});

			data.MinSortKey = minSortKey;
			data.MaxSortKey = maxSortKey;

			if (scanForward)
				data.Items.reverse();

			return data;
		});
}

async function getDtrList(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const filters: string[] = [];

	// Set the default query parameters
	event.queryStringParameters = event.queryStringParameters || {};
	const queryConfigs: QueryInputWithAttributes[] = [];

	// Determine which index to use and generate the configs
	if (typeof event.queryStringParameters.tg !== 'undefined') {
		const talkgroups = event.queryStringParameters.tg.split('|');
		talkgroups.forEach(tg => {
			queryConfigs.push({
				TableName: dtrTable,
				IndexName: 'StartTimeTgIndex',
				ScanIndexForward: false,
				ExpressionAttributeNames: {
					'#tg': 'Talkgroup'
				},
				ExpressionAttributeValues: {
					':tg': {
						N: tg
					}
				},
				Limit: defaultListLimit,
				KeyConditionExpression: '#tg = :tg'
			});
		});
	} else {
		let emergencyValues = [ '0', '1' ];
		if (
			typeof event.queryStringParameters.emerg !== 'undefined' &&
			event.queryStringParameters.emerg === 'y'
		)
			emergencyValues = [ '1' ];

		emergencyValues.forEach(emerg => queryConfigs.push({
			TableName: dtrTable,
			IndexName: 'StartTimeEmergIndex',
			ScanIndexForward: false,
			ExpressionAttributeNames: {
				'#emerg': 'Emergency'
			},
			ExpressionAttributeValues: {
				':emerg': {
					N: emerg
				}
			},
			Limit: defaultListLimit,
			KeyConditionExpression: '#emerg = :emerg'
		}));
	}

	// Check for a key to start scanning at
	if (typeof event.queryStringParameters.next !== 'undefined') {
		const scanningKeys: (aws.DynamoDB.Key | undefined)[] = event.queryStringParameters.next
			.split('|')
			.map(str => {
				if (str === '') return;

				const parts = str.split(',');
				return {
					Emergency: {
						N: parts[0]
					},
					Talkgroup: {
						N: parts[1]
					},
					Added: {
						N: parts[2]
					}
				};
			});

		queryConfigs.forEach((queryConfig, index) => {
			if (!scanningKeys[index]) return;

			queryConfig.ExclusiveStartKey = scanningKeys[index];
		});
	}

	// Check for a timing filter
	if (
		typeof event.queryStringParameters.before !== 'undefined' &&
		!isNaN(Number(event.queryStringParameters.before))
	) {
		const before = event.queryStringParameters.before;

		queryConfigs.forEach(queryConfig => {
			queryConfig.ExpressionAttributeNames['#st'] = 'StartTime';
			queryConfig.ExpressionAttributeValues[':st'] = {
				N: before
			};
			queryConfig.KeyConditionExpression += ' AND #st < :st';
		});
	} else if (
		typeof event.queryStringParameters.after !== 'undefined' &&
		!isNaN(Number(event.queryStringParameters.after))
	) {
		const after = event.queryStringParameters.after;

		queryConfigs.forEach(queryConfig => {
			const newIndexName: string | undefined = dtrTableIndexes[queryConfig.IndexName as string];
			if (newIndexName === undefined) {
				delete queryConfig.IndexName;
			} else {
				queryConfig.IndexName = newIndexName;
			}
			queryConfig.ScanIndexForward = true;
		
			queryConfig.ExpressionAttributeNames['#st'] = 'Added';
			queryConfig.ExpressionAttributeValues[':st'] = {
				N: after
			};
			queryConfig.KeyConditionExpression += ' AND #st > :st';
		});
	}

	// Check for a source filter
	if (typeof event.queryStringParameters.source !== 'undefined') {
		const sources = event.queryStringParameters.source.split('|');
		const localFilters: string[] = [];
		sources.forEach((source, index) => {
			localFilters.push(`contains(#src, :src${index})`);

			queryConfigs.forEach(queryConfig => {
				queryConfig.ExpressionAttributeNames['#src'] = 'Sources';
				queryConfig.ExpressionAttributeValues[`:src${index}`] = {
					N: source
				};
			});
		});
		filters.push(`(${localFilters.join(' OR ')})`);
	}

	if (filters.length > 0)
		queryConfigs.forEach(queryConfig => queryConfig.FilterExpression = filters.join(' AND '));

	const data = await mergeDynamoQueries(queryConfigs, 'StartTime', 'Added');
	const body = JSON.stringify({
		success: true,
		count: data.Count,
		scanned: data.ScannedCount,
		continueToken: data.LastEvaluatedKeys
			.map(item => {
				if (item === null) return '';

				return `${item.Emergency?.N},${item.Talkgroup?.N},${item.StartTime?.N}`;
			})
			.join('|'),
		before: data.MinSortKey,
		after: data.MaxSortKey,
		data: data.Items.map(parseDynamoDbAttributeMap)
	});

	return {
		statusCode: 200,
		headers: {},
		body
	};
}

async function getDtrTalkgroups(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	event.queryStringParameters = event.queryStringParameters || {};
	const queryConfigs: QueryInputWithAttributes[] = [];

	// Build the partitions
	const partitions = [ 'Y' ];
	if (event.queryStringParameters.all === 'y')
		partitions.push('N');

	// Build the base query parameters
	partitions.forEach(partition => queryConfigs.push({
		TableName: talkgroupTable,
		IndexName: 'InUseIndex',
		ExpressionAttributeNames: {
			'#iu': 'InUse',
			'#name': 'Name',
			'#id': 'ID',
			'#c': 'Count'
		},
		ExpressionAttributeValues: {
			':iu': {
				S: partition
			}
		},
		KeyConditionExpression: '#iu = :iu',
		ProjectionExpression: '#id,#name,#c'
	}));

	// Get the data and build the response
	const data = await mergeDynamoQueries(queryConfigs, 'Count');
	data.Items.map(item => {
		if (typeof item.Count === 'undefined') {
			item.Count = {
				N: '0'
			};
		}
	});
	const body = JSON.stringify({
		success: true,
		count: data.Count,
		scanned: data.ScannedCount,
		data: data.Items
			.map(parseDynamoDbAttributeMap)
	});

	return {
		statusCode: 200,
		headers: {},
		body
	};
}

async function getTexts(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
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
		!user.isActive?.BOOL ||
		!user.isAdmin?.BOOL
	) {
		return unauthorizedResponse;
	}

	const result = await dynamodb.query({
		TableName: textsTable,
		IndexName: 'isTestIndex',
		Limit: defaultListLimit,
		ScanIndexForward: false,
		ExpressionAttributeNames: {
			'#its': 'isTestString'
		},
		ExpressionAttributeValues: {
			':its': {
				S: 'n'
			}
		},
		KeyConditionExpression: '#its = :its'
	}).promise();

	return {
		statusCode: 200,
		headers: {},
		body: JSON.stringify({
			success: true,
			count: result.Count,
			scanned: result.ScannedCount,
			data: result.Items?.map(parseDynamoDbAttributeMap)
		})
	};
}

interface GenericApiResponse {
	success: boolean;
	errors: string[];
	message?: string;
	data?: any[] | any;
}

async function handlePageView(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const date = new Date();
	const response: GenericApiResponse = {
		success: true,
		errors: []
	};

	// Validate the body
	validateBodyIsJson(event.body);

	// Parse the body
	const body = JSON.parse(event.body as string) as {
		cs: number;
		f: string;
	};

	// Validate the body
	if (!body.cs || typeof body.cs !== 'number') {
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
		IndexName: 'pageIndex',
		ExpressionAttributeNames: {
			'#pid': 'pageId',
			'#ip': 'isPage'
		},
		ExpressionAttributeValues: {
			':pid': {
				S: body.f
			},
			':ip': {
				S: 'y'
			}
		},
		KeyConditionExpression: '#ip = :ip',
		FilterExpression: '#pid = :pid',
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
		result.Items[0].csLooked.NS &&
		result.Items[0].csLooked.NS.indexOf(`${body.cs}`) !== -1
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
				NS: [
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
	[key: string]: aws.CloudWatch.MetricDataQuery;
} = {
	'api-frontend': {
		Id: 'api_frontend',
		Label: 'Frontend API Calls',
		MetricStat: {
			Metric: {
				Namespace: 'CVFD API',
				MetricName: 'Call',
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
	'api-infra': {
		Id: 'api_infra',
		Label: 'Infrastructure API Calls',
		MetricStat: {
			Metric: {
				Namespace: 'CVFD API',
				MetricName: 'Call',
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
	'api-user': {
		Id: 'api_user',
		Label: 'User API Calls',
		MetricStat: {
			Metric: {
				Namespace: 'CVFD API',
				MetricName: 'Call',
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
	'api-twilio': {
		Id: 'api_twilio',
		Label: 'Twilio API Calls',
		MetricStat: {
			Metric: {
				Namespace: 'CVFD API',
				MetricName: 'Call',
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
	's3-dtr': {
		Id: 's3_dtr',
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
		Id: 's3_dtr_dup',
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
		Id: 's3_dtr_uniq',
		Label: 'Unique DTR Files Uploaded',
		Expression: 's3_dtr-s3_dtr_dup'
	},
	's3-vhf': {
		Id: 's3_vhf',
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
	's3-calls': {
		Id: 's3_calls',
		Label: 'S3 Events',
		Expression: 's3_dtr+s3_vhf'
	},
	's3-created': {
		Id: 's3_created',
		Label: 'S3 Files Created',
		Expression: 's3_dtr+s3_vhf-s3_dtr_dup'
	},
	'queue': {
		Id: 'queue',
		Label: 'Queue Events',
		MetricStat: {
			Metric: {
				Namespace: 'CVFD API',
				MetricName: 'Call',
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
	'err-frontend': {
		Id: 'err_frontend',
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
		Id: 'err_infra',
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
		Id: 'err_user',
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
		Id: 'err_twilio',
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
	'err-s3': {
		Id: 'err_s3',
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
		Id: 'err_queue',
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
	'err-total-api': {
		Id: 'err_total_api',
		Label: 'Total API Errors',
		Expression: 'err_frontend+err_infra+err_user+err_twilio'
	},
	'err-total-event': {
		Id: 'err_total_event',
		Label: 'Total Event Errors',
		Expression: 'err_s3+err_queue'
	},
	'err-total': {
		Id: 'err_total',
		Label: 'Total Errors',
		Expression: 'err_s3+err_queue+err_frontend+err_infra+err_user+err_twilio'
	},
	'tower-sag-min': {
		Id: 'tower_sag_min',
		Label: 'Saguache Tower Decode Rate - Min',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'Decode Rate',
				Dimensions: [
					{
						Name: 'Tower',
						Value: 'Saguache Tower'
					}
				]
			},
			Period: 60,
			Stat: 'Minimum',
			Unit: 'Count'
		}
	},
	'tower-sag-max': {
		Id: 'tower_sag_max',
		Label: 'Saguache Tower Decode Rate - Max',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'Decode Rate',
				Dimensions: [
					{
						Name: 'Tower',
						Value: 'Saguache Tower'
					}
				]
			},
			Period: 60,
			Stat: 'Maximum',
			Unit: 'Count'
		}
	},
	'tower-sag-upload': {
		Id: 'tower_sag_uploads',
		Label: 'Saguache Tower Uploads',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'Upload',
				Dimensions: [ {
					Name: 'Tower',
					Value: 'saguache'
				} ]
			},
			Period: 60,
			Stat: 'Sum',
			Unit: 'Count'
		}
	},
	'tower-ala-min': {
		Id: 'tower_ala_min',
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
		Id: 'tower_ala_max',
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
		Id: 'tower_ala_uploads',
		Label: 'Alamosa Tower Uploads',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'Upload',
				Dimensions: [ {
					Name: 'Tower',
					Value: 'alamosa'
				} ]
			},
			Period: 60,
			Stat: 'Sum',
			Unit: 'Count'
		}
	},
	'tower-pt-min': {
		Id: 'tower_pt_min',
		Label: 'Pool Table Tower Decode Rate - Min',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'Decode Rate',
				Dimensions: [
					{
						Name: 'Tower',
						Value: 'Pool Table Mountain'
					}
				]
			},
			Period: 60,
			Stat: 'Minimum',
			Unit: 'Count'
		}
	},
	'tower-pt-max': {
		Id: 'tower_pt_max',
		Label: 'Pool Table Tower Decode Rate - Max',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'Decode Rate',
				Dimensions: [
					{
						Name: 'Tower',
						Value: 'Pool Table Mountain'
					}
				]
			},
			Period: 60,
			Stat: 'Maximum',
			Unit: 'Count'
		}
	},
	'tower-pt-upload': {
		Id: 'tower_pt_uploads',
		Label: 'Pool Table Uploads',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'Upload',
				Dimensions: [ {
					Name: 'Tower',
					Value: 'pooltable'
				} ]
			},
			Period: 60,
			Stat: 'Sum',
			Unit: 'Count'
		}
	},
	'tower-sa-min': {
		Id: 'tower_sa_min',
		Label: 'San Antonio Peak Decode Rate - Min',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'Decode Rate',
				Dimensions: [
					{
						Name: 'Tower',
						Value: 'San Antonio Peak'
					}
				]
			},
			Period: 60,
			Stat: 'Minimum',
			Unit: 'Count'
		}
	},
	'tower-sa-max': {
		Id: 'tower_sa_max',
		Label: 'San Antonio Peak Decode Rate - Max',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'Decode Rate',
				Dimensions: [
					{
						Name: 'Tower',
						Value: 'San Antonio Peak'
					}
				]
			},
			Period: 60,
			Stat: 'Maximum',
			Unit: 'Count'
		}
	},
	'tower-sa-upload': {
		Id: 'tower_sa_uploads',
		Label: 'San Antonio Peak Uploads',
		MetricStat: {
			Metric: {
				Namespace: 'DTR Metrics',
				MetricName: 'Upload',
				Dimensions: [ {
					Name: 'Tower',
					Value: 'sanantonio'
				} ]
			},
			Period: 60,
			Stat: 'Sum',
			Unit: 'Count'
		}
	},
	'tower-mv-min': {
		Id: 'tower_mv_min',
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
		Id: 'tower_mv_max',
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
		Id: 'tower_mv_uploads',
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
		Id: 'twilio_init',
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
		Id: 'twilio_sent',
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
		Id: 'twilio_delivered',
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
		Id: 'twilio_sent_percent',
		Label: '% Texts Sent',
		Expression: 'FLOOR(100*(twilio-sent/twilio-init))'
	},
	'twilio-delivered-percent': {
		Id: 'twilio_delivered_percent',
		Label: '% Texts Delivered',
		Expression: 'FLOOR(100*(twilio-delivered/twilio-init))'
	},
	'twilio-sent-time': {
		Id: 'twilio_sent_time',
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
		Id: 'twilio_delivered_time',
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
		Id: 'twilio_page_duration',
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
		Id: 'twilio_page_time',
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
		Id: 'twilio_delivered_sent_time',
		Label: 'Time To Deliver Texts',
		Expression: 'twilio_delivered_time-twilio_sent_time'
	}
};
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
		!user.isActive?.BOOL ||
		!user.isAdmin?.BOOL
	) {
		return unauthorizedResponse;
	}

	const response: GenericApiResponse & {
		startTime?: number;
		endTime?: number;
		period?: number;
		metrics?: string[];
		request?: any;
	} = {
		success: true,
		errors: []
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
	response.startTime = Number(event.queryStringParameters.startTime);
	response.endTime = Number(event.queryStringParameters.endTime);
	response.period = Number(event.queryStringParameters.period);

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

	response.metrics = metricsToInclude;
	response.request = metricRequest;

	response.data = await cloudWatch.getMetricData(metricRequest).promise()
		.then(response => {
			if (typeof response.MetricDataResults === 'undefined')
				return [];

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
		.catch(e => [ 'Error', e ]);

	return {
		statusCode: 200,
		body: JSON.stringify(response)
	};
}

export async function main(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const action = event.queryStringParameters?.action || 'none';
	try {
		await incrementMetric('Call', {
			source: metricSource,
			action
		}, true, false);
		switch (action) {
			case 'dtr':
				return await getDtrList(event);
			case 'talkgroups':
				return await getDtrTalkgroups(event);
			case 'listTexts':
				return await getTexts(event);
			case 'pageView':
				return await handlePageView(event);
			case 'stats':
				return await getStats(event);
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
		}
	} catch (e) {
		await incrementMetric('Error', {
			source: metricSource,
			type: 'Thrown exception'
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
