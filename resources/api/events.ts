import * as aws from 'aws-sdk';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { incrementMetric, validateBodyIsJson } from '../utils/general';

const metricSource = 'Events';
const FIREHOSE_NAME = process.env.FIREHOSE_NAME as string;

const firehose = new aws.Firehose();

interface EventBody {
	event: string;
	tower: string;
	radioId: number;
	talkgroup?: string | number;
	talkgroupList?: string;
}

interface GenericApiResponse {
	success: boolean;
	errors: string[];
	message?: string;
	data?: any[];
}

async function handleEvent(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	// Validate the body
	validateBodyIsJson(event.body);

	// Parse the body
	const body: EventBody = JSON.parse(event.body as string);
	const response: GenericApiResponse = {
		success: true,
		errors: []
	};

	// Remove empty values
	if (body.talkgroup === '')
		body.talkgroup = '0';
	if (body.talkgroupList === '')
		body.talkgroupList = '0';

	// Validate the body
	if (typeof body.event !== 'string') {
		response.success = false;
		response.errors.push('event');
	}
	if (typeof body.tower !== 'string') {
		response.success = false;
		response.errors.push('tower');
	}
	if (typeof body.radioId !== 'number') {
		response.success = false;
		response.errors.push('radioId');
	}
	if (typeof body.talkgroup !== 'undefined' && (
		typeof body.talkgroup !== 'string' ||
		!/^-?[0-9]+$/.test(body.talkgroup)
	)) {
		response.success = false;
		response.errors.push('talkgroup');
	}
	if (typeof body.talkgroupList !== 'undefined' && (
		typeof body.talkgroupList !== 'string' ||
		!/^([0-9]+,?)+$/.test(body.talkgroupList)
	)) {
		response.success = false;
		response.errors.push('talkgroup');
	}

	await firehose.putRecord({
		DeliveryStreamName: FIREHOSE_NAME,
		Record: {
			Data: JSON.stringify(body)
		}
	}).promise();

	return {
		statusCode: response.success ? 200 : 400,
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
			case 'event':
				return await handleEvent(event);
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
