import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { incrementMetric } from '../utils';
import { getLoggedInUser } from '../utils/auth';

const metricSource = 'User';

interface CurrentUser {
	isUser: boolean;
	isAdmin: boolean;
	isDistrictAdmin: boolean;
	user: string | null;
}

async function getUser(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const user = await getLoggedInUser(event);
	const response: CurrentUser = {
		isUser: false,
		isAdmin: false,
		isDistrictAdmin: false,
		user: null
	};

	if (user !== null) {
		response.isUser = true;
		response.isAdmin = !!user.isAdmin?.BOOL;
		response.isDistrictAdmin = !!user.isDistrictAdmin?.BOOL;
		response.user = user.name?.S || null;
	}

	return {
		statusCode: 200,
		body: JSON.stringify(response)
	};
}

export async function main(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	const action = event.queryStringParameters?.action || '';
	try {
		await incrementMetric('Call', {
			source: metricSource,
			action
		});
		switch (action) {
			case 'getUser':
				return await getUser(event);
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
			type: 'general'
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
