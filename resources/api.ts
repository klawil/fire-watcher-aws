import * as AWS from 'aws-sdk';
const dynamodb = new AWS.DynamoDB();
import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';

const trafficTable = process.env.TABLE_TRAFFIC as string;

async function getList(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
	const queryConfig: AWS.DynamoDB.ScanInput = {
		TableName: trafficTable
	};
	const filters: string[] = [];

	// Check for the next key
	if (event.queryStringParameters?.after) {
		queryConfig.ExpressionAttributeValues = queryConfig.ExpressionAttributeValues || {};
		queryConfig.ExpressionAttributeValues[':after'] = {
			N: event.queryStringParameters.after
		};
		queryConfig.ExpressionAttributeNames = queryConfig.ExpressionAttributeNames || {};
		queryConfig.ExpressionAttributeNames['#dt'] = 'Datetime';
		filters.push('#dt > :after');
	}

	// Check for the tone filter
	if (event.queryStringParameters?.tone) {
		queryConfig.ExpressionAttributeValues = queryConfig.ExpressionAttributeValues || {};
		queryConfig.ExpressionAttributeValues[':tone'] = {
			BOOL: event.queryStringParameters.tone === 'y'
		};
		filters.push('Tone = :tone');
	}

	// Add the filter strings
	if (filters.length > 0) {
		queryConfig.FilterExpression = filters.join(' and ');
	}

	const data = await dynamodb.scan(queryConfig).promise();

	// Parse the results
	const body = JSON.stringify({
		success: true,
		data: data.Items?.map((item) => Object.keys(item).reduce((coll: { [key: string]: any; }, key) => {
			if (typeof item[key].N !== 'undefined') {
				coll[key] = Number.parseFloat(item[key].N as string);
			} else if (typeof item[key].BOOL !== 'undefined') {
				coll[key] = item[key].BOOL;
			} else if (typeof item[key].S !== 'undefined') {
				coll[key] = item[key].S;
			} else {
				coll[key] = item[key];
			}

			return coll;
		}, {}))
	});

	// Send for results
	return {
		statusCode: 200,
		headers: {},
		body
	};
}

export async function main(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
	try {
		const action = event.queryStringParameters?.action || 'list';
		switch (action) {
			case 'list':
				return getList(event);
		}

		return {
			statusCode: 404,
			headers: {},
			body: JSON.stringify({
				error: true,
				message: `Invalid action ${action}`
			})
		};
	} catch (e) {
		const body = {
			error: true,
			message: JSON.stringify(e, null, 2)
		}
		return {
			statusCode: 400,
			headers: {},
			body: JSON.stringify(body)
		};
	}
};
