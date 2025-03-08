import * as aws from 'aws-sdk';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { incrementMetric, validateBodyIsJson } from '../utils/general';

const metricSource = 'Events';
const FIREHOSE_NAME = process.env.FIREHOSE_NAME as string;

const firehose = new aws.Firehose();

interface EventBody {
	event: string;
	tower: string;
	radioId: string;
	talkgroup?: string;
	talkgroupList?: string;
	timestamp?: number;
}

interface GenericApiResponse {
	success: boolean;
	errors: string[];
	message?: string;
	data?: any[];
}

function validateEventBody(body: EventBody, index: number, response: GenericApiResponse): void {
	body.timestamp = Date.now();

	// Validate the body
	if (typeof body.event !== 'string') {
		response.success = false;
		response.errors.push(`${index}-event`);
	}
	if (typeof body.tower !== 'string') {
		response.success = false;
		response.errors.push(`${index}-tower`);
	}
	if (
		typeof body.radioId !== 'string' ||
		!/^[0-9]+$/.test(body.radioId)
	) {
		response.success = false;
		response.errors.push(`${index}-radioId`);
	}
	if (
		typeof body.talkgroup !== 'string' ||
		!/^[0-9]*$/.test(body.talkgroup)
	) {
		response.success = false;
		response.errors.push(`${index}-talkgroup`);
	}
	if (
		typeof body.talkgroupList !== 'string' ||
		!/^([0-9]*,?)+$/.test(body.talkgroupList)
	) {
		response.success = false;
		response.errors.push(`${index}-talkgroupList`);
	}
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

	validateEventBody(body, 0, response);

	if (body.radioId !== '-1' && response.success)
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

async function handleEvents(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	// Validate the body
	validateBodyIsJson(event.body);

	// Parse the body
	const body: EventBody[] = JSON.parse(event.body as string);
	const response: GenericApiResponse = {
		success: true,
		errors: []
	};

	body.forEach((event, i) => validateEventBody(event, i, response));

	if (
		response.success &&
		body.filter(event => event.radioId !== '-1').length > 0
	) {
		await firehose.putRecordBatch({
			DeliveryStreamName: FIREHOSE_NAME,
			Records: body
				.filter(event => event.radioId !== '-1')
				.map(event => ({
					Data: JSON.stringify(event)
				}))
		}).promise();
	}

	return {
		statusCode: response.success ? 200 : 400,
		body: JSON.stringify(response),
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
			case 'events':
				return await handleEvents(event);
		}

		console.error(`Invalid action - '${action}'`);
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
