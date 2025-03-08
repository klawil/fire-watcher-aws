import * as aws from 'aws-sdk';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { incrementMetric, parseDynamoDbAttributeMap, validateBodyIsJson } from '../utils/general';
import { getLoggedInUser } from '../utils/auth';

const metricSource = 'Frontend';

const dynamodb = new aws.DynamoDB();

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
	if (user === null) {
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
	data?: any[];
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
		}

		await incrementMetric('Error', {
			source: metricSource
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
			source: metricSource
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
