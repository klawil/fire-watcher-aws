import * as aws from 'aws-sdk';
import { getLogger } from '../../../common/logger';

const logger = getLogger('dynamo');

interface DynamoListOutput extends aws.DynamoDB.QueryOutput {
	Items: aws.DynamoDB.ItemList;
	Count: number;
	ScannedCount: number;
	LastEvaluatedKeys: (aws.DynamoDB.Key | null)[];
	MinSortKey: number | null;
	MaxSortKey: number | null;
	MaxAfterKey: number | null;
}

const dynamodb = new aws.DynamoDB();

export async function mergeDynamoQueries(
	queryConfigs: aws.DynamoDB.QueryInput[],
	sortKey: string,
	afterKey: string = ''
): Promise<DynamoListOutput> {
	logger.trace('mergeDynamoQueries', ...arguments);
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
			MaxSortKey: null,
			MaxAfterKey: null,
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
			let maxAfterKey: null | number = null;
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
					!isNaN(sortKeyValue) &&
					(
						maxSortKey === null ||
						sortKeyValue > maxSortKey
					)
				)
					maxSortKey = sortKeyValue;

				if (
					!isNaN(afterKeyValue) &&
					(
						maxAfterKey === null ||
						afterKeyValue > maxAfterKey
					)
				)
					maxAfterKey = afterKeyValue;
			});

			data.MinSortKey = minSortKey;
			data.MaxSortKey = maxSortKey;
			data.MaxAfterKey = maxAfterKey;

			if (scanForward)
				data.Items.reverse();

			return data;
		});
}
