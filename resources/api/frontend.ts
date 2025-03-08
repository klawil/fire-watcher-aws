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

export async function main(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const action = event.queryStringParameters?.action;
	try {
		console.log(`API - FRONTEND - CALL - ${action}`);
		switch (action) {
			case 'vhf':
				return await getVhfList(event);
			case 'dtr':
			case 'talkgroups':
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
