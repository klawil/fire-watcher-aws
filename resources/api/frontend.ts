import * as AWS from 'aws-sdk';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { parseDynamoDbAttributeMap } from '../utils';

const dynamodb = new AWS.DynamoDB();

const defaultListLimit = 100;

const vhfTable = process.env.TABLE_VHF as string;
const dtrTable = process.env.TABLE_DTR as string;
const talkgroupTable = process.env.TABLE_TALKGROUP as string;
const deviceTable = process.env.TABLE_DEVICE as string;
const textsTable = process.env.TABLE_TEXTS as string;

const dtrTableIndexes: {
	[key: string]: undefined | string;
} = {
	StartTimeEmergIndex: 'AddedIndex',
	StartTimeTgIndex: undefined
};

interface QueryInputWithAttributes extends AWS.DynamoDB.QueryInput {
	ExpressionAttributeValues: AWS.DynamoDB.ExpressionAttributeValueMap;
	ExpressionAttributeNames: AWS.DynamoDB.ExpressionAttributeNameMap;
}

interface DynamoListOutput extends AWS.DynamoDB.QueryOutput {
	Items: AWS.DynamoDB.ItemList;
	Count: number;
	ScannedCount: number;
	LastEvaluatedKeys: (AWS.DynamoDB.Key | null)[];
	MinSortKey: number | null;
	MaxSortKey: number | null;
}

async function mergeDynamoQueries(
	queryConfigs: AWS.DynamoDB.QueryInput[],
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

async function getVhfList(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {

	// Set the default query parameters
	event.queryStringParameters = event.queryStringParameters || {};
	event.queryStringParameters = {
		minLen: '0',
		...event.queryStringParameters
	};

	// Build the query configs
	const queryConfigs: QueryInputWithAttributes[] = [];

	// Add the tone filters
	const toneFilters: string[] = [];
	if (event.queryStringParameters.tone) {
		toneFilters.push(event.queryStringParameters.tone === 'y' ? 'y' : 'n');
	} else {
		toneFilters.push('y', 'n');
	}
	toneFilters.forEach(tone => queryConfigs.push({
		TableName: vhfTable,
		IndexName: 'ToneIndex',
		Limit: defaultListLimit,
		ScanIndexForward: false,
		ExpressionAttributeNames: {
			'#t': 'ToneIndex',
			'#l': 'Len'
		},
		ExpressionAttributeValues: {
			':t': {
				S: tone
			},
			':l': {
				N: event.queryStringParameters?.minLen
			}
		},
		KeyConditionExpression: '#t = :t',
		FilterExpression: '#l >= :l'
	}));

	// Check for a start scanning key
	if (typeof event.queryStringParameters.next !== 'undefined') {
		const scanningKeys: (AWS.DynamoDB.Key | undefined)[] = event.queryStringParameters.next
			.split('|')
			.map(str => {
				if (str === '') return;

				const parts = str.split(',');
				return {
					ToneIndex: {
						S: parts[0]
					},
					Datetime: {
						N: parts[1]
					},
					Key: {
						S: parts[2]
					}
				};
			});

		queryConfigs.forEach((queryConfig, index) => {
			if (!scanningKeys[index]) return;

			queryConfig.ExclusiveStartKey = scanningKeys[index];
		});
	}

	// Handle fetching items before/after a certain point
	if (
		typeof event.queryStringParameters.before !== 'undefined' &&
		!isNaN(Number(event.queryStringParameters.before))
	) {
		const before = event.queryStringParameters.before;
		queryConfigs.forEach(queryConfig => {
			queryConfig.ExpressionAttributeNames['#dt'] = 'Datetime';
			queryConfig.ExpressionAttributeValues[':dt'] = {
				N: before
			};
			queryConfig.KeyConditionExpression += ' AND #dt < :dt';
		});
	} else if (
		typeof event.queryStringParameters.after !== 'undefined' &&
		!isNaN(Number(event.queryStringParameters.after))
	) {
		const after = event.queryStringParameters.after;
		queryConfigs.forEach(queryConfig => {
			queryConfig.ScanIndexForward = true;
			queryConfig.ExpressionAttributeNames['#dt'] = 'Datetime';
			queryConfig.ExpressionAttributeValues[':dt'] = {
				N: after
			};
			queryConfig.KeyConditionExpression += ' AND #dt > :dt';
		});
	}

	// Run the queries and generate the results
	const data = await mergeDynamoQueries(queryConfigs, 'Datetime');
	const body = JSON.stringify({
		success: true,
		count: data.Count,
		scanned: data.ScannedCount,
		continue: data.LastEvaluatedKeys
			.map(item => {
				if (item === null) return '';

				return `${item.ToneIndex.S},${item.Datetime.N},${item.Key.S}`;
			})
			.join('|'),
		before: data.MinSortKey,
		after: data.MaxSortKey,
		data: data.Items
			.map(parseDynamoDbAttributeMap)
			.map(item => {
				let Source = (item.Key as string).split('/')[1].replace(/_\d{8}_\d{6}.*$/, '');

				if (Source === 'FIRE')
					Source = 'SAG_FIRE_VHF';

				return {
					...item,
					Source
				};
			})
	});

	return {
		statusCode: 200,
		headers: {},
		body
	};
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
		const scanningKeys: (AWS.DynamoDB.Key | undefined)[] = event.queryStringParameters.next
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

export async function main(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const action = event.queryStringParameters?.action;
	try {
		console.log(`API - FRONTEND - CALL - ${action}`);
		switch (action) {
			case 'vhf':
				return await getVhfList(event);
			case 'dtr':
				return await getDtrList(event);
			case 'talkgroups':
				return await getDtrTalkgroups(event);
			case 'listTexts':
		}

		console.log(`API - FRONTEND - 404`);
		return {
			statusCode: 404,
			headers: {},
			body: JSON.stringify({
				error: true,
				message: `Invalid action '${action}'`
			})
		}
	} catch (e) {
		console.log(`API - FRONTEND - ERROR - ${action}`);
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
