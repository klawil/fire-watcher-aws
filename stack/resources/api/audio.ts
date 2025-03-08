import * as aws from 'aws-sdk';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { incrementMetric, parseDynamoDbAttributeMap } from '../utils/general';
import { mergeDynamoQueries } from '../utils/dynamo';
import { ApiAudioListResponse, ApiAudioTalkgroupsResponse, AudioFileObject, TalkgroupObject } from '../../../common/audioApi';
import { getLogger } from '../utils/logger';

const logger = getLogger('audio');

const metricSource = 'Audio';

const dtrTable = process.env.TABLE_DTR as string;
const talkgroupTable = process.env.TABLE_TALKGROUP as string;

const defaultListLimit = 100;
const dtrTableIndexes: {
	[key: string]: undefined | string;
} = {
	StartTimeEmergIndex: 'AddedIndex',
	StartTimeTgIndex: undefined
};

/**
 * Query String Parameters
 * @param tg         String String of talkgroup IDs joined by '|'
 * @param emerg      y      Pass y to only receive emergency transmissions
 * @param before     Number The timestamp to get values before (s since epoch)
 * @param after      Number The timestamp to get values after (s since epoch)
 * @param addedAfter Number The timestamp to get values added after (ms since epoch)
 */
async function getList(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.trace('getList', ...arguments);
	const queryStringParameters: {
		tg?: string;
		emerg?: 'y' | 'n';
		next?: string;
		before?: string;
		after?: string;
		afterAdded?: string;
	} = event.queryStringParameters || {};
	const queryConfigs: aws.DynamoDB.QueryInput[] = [];

	// Determine which index to user and generate the base configs
	if (typeof queryStringParameters.tg !== 'undefined') {
		queryStringParameters.tg.split('|')
			.forEach(tg => queryConfigs.push({
				TableName: dtrTable,
				IndexName: 'StartTimeTgIndex',
				ScanIndexForward: false,
				ExpressionAttributeNames: {
					'#tg': 'Talkgroup',
				},
				ExpressionAttributeValues: {
					':tg': { N: tg },
				},
				Limit: defaultListLimit,
				KeyConditionExpression: '#tg = :tg',
			}));
	} else {
		let emergencyValues = [ '0', '1' ];
		if (typeof queryStringParameters.emerg !== 'undefined')
			emergencyValues = queryStringParameters.emerg === 'y' ? [ '1' ] : [ '0' ];

		emergencyValues.forEach(emerg => queryConfigs.push({
			TableName: dtrTable,
			IndexName: 'StartTimeEmergIndex',
			ScanIndexForward: false,
			ExpressionAttributeNames: {
				'#emerg': 'Emergency',
			},
			ExpressionAttributeValues: {
				':emerg': { N: emerg },
			},
			Limit: defaultListLimit,
			KeyConditionExpression: '#emerg = :emerg',
		}));
	}

	// Check for a timing filter
	if (
		typeof queryStringParameters.before !== 'undefined' &&
		!isNaN(Number(queryStringParameters.before))
	) {
		const before = queryStringParameters.before;

		queryConfigs.forEach(queryConfig => {
			queryConfig.ExpressionAttributeNames = queryConfig.ExpressionAttributeNames || {};
			queryConfig.ExpressionAttributeValues = queryConfig.ExpressionAttributeValues || {};

			queryConfig.ExpressionAttributeNames['#st'] = 'StartTime';
			queryConfig.ExpressionAttributeValues[':st'] = { N: before };
			queryConfig.KeyConditionExpression += ' AND #st < :st';
		});
	} else if (
		typeof queryStringParameters.after !== 'undefined' &&
		!isNaN(Number(queryStringParameters.after))
	) {
		const after = queryStringParameters.after;

		queryConfigs.forEach(queryConfig => {
			queryConfig.ScanIndexForward = true;

			queryConfig.ExpressionAttributeNames = queryConfig.ExpressionAttributeNames || {};
			queryConfig.ExpressionAttributeValues = queryConfig.ExpressionAttributeValues || {};

			queryConfig.ExpressionAttributeNames['#st'] = 'StartTime';
			queryConfig.ExpressionAttributeValues[':st'] = { N: after };
			queryConfig.KeyConditionExpression += ' AND #st > :st';
		});
	} else if (
		typeof queryStringParameters.afterAdded !== 'undefined' &&
		!isNaN(Number(queryStringParameters.afterAdded))
	) {
		const afterAdded = queryStringParameters.afterAdded;

		queryConfigs.forEach(queryConfig => {
			const newIndexName = dtrTableIndexes[queryConfig.IndexName as string];
			if (newIndexName === undefined)
				delete queryConfig.IndexName;
			else
				queryConfig.IndexName = newIndexName;

			queryConfig.ScanIndexForward = true;

			queryConfig.ExpressionAttributeNames = queryConfig.ExpressionAttributeNames || {};
			queryConfig.ExpressionAttributeValues = queryConfig.ExpressionAttributeValues || {};

			queryConfig.ExpressionAttributeNames['#added'] = 'Added';
			queryConfig.ExpressionAttributeValues[':added'] = { N: afterAdded };
			queryConfig.KeyConditionExpression += ' AND #added > :added';
		});
	}

	// Get the data
	const data = await mergeDynamoQueries(queryConfigs, 'StartTime', 'Added');
	const body: ApiAudioListResponse = {
		success: true,
		before: data.MinSortKey,
		after: data.MaxSortKey,
		afterAdded: data.MaxAfterKey,
		files: data.Items.map(parseDynamoDbAttributeMap)
			.map(item => item as unknown as AudioFileObject),
	};

	return {
		statusCode: 200,
		body: JSON.stringify(body),
	};
}

async function getTalkgroups(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.trace('getTalkgroups', ...arguments);
	event.queryStringParameters = event.queryStringParameters || {};
	const queryConfigs: aws.DynamoDB.QueryInput[] = [];

	// See which partitions we should look in
	const partitions = [ 'Y' ];
	if (event.queryStringParameters.all === 'y')
		partitions.push('N');

	// Build the base query configs
	partitions.forEach(partition => queryConfigs.push({
		TableName: talkgroupTable,
		IndexName: 'InUseIndex',
		ExpressionAttributeNames: {
			'#iu': 'InUse',
			'#name': 'Name',
			'#id': 'ID',
			'#c': 'Count',
		},
		ExpressionAttributeValues: {
			':iu': { S: partition, },
		},
		KeyConditionExpression: '#iu = :iu',
		ProjectionExpression: '#id,#name,#c',
	}));

	// Retrieve the data
	const data = await mergeDynamoQueries(queryConfigs, 'Count');
	data.Items.forEach(item => {
		if (typeof item.Count === 'undefined') {
			item.Count = { N: '0' };
		}
	});

	const body: ApiAudioTalkgroupsResponse = {
		success: true,
		talkgroups: data.Items
			.map(parseDynamoDbAttributeMap)
			.map(item => item as unknown as TalkgroupObject),
	};

	return {
		statusCode: 200,
		body: JSON.stringify(body),
	};
}

export async function main(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.debug('main', ...arguments);
	const action = event.queryStringParameters?.action || 'none';
	try {
		switch (action) {
			case 'list':
				return await getList(event);
			case 'talkgroups':
				return await getTalkgroups(event);
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
