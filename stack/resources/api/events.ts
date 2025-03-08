import * as aws from 'aws-sdk';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { incrementMetric, validateBodyIsJson } from '../utils/general';
import { getLogger } from '../utils/logger';

const logger = getLogger('events');

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

function validateEventBody(body: EventBody, index: number, response: GenericApiResponse): boolean {
	logger.trace('validateEventBody', ...arguments);
	body.timestamp = Date.now();
	let thisItemSuccess = true;

	// Validate the body
	if (typeof body.event !== 'string') {
		response.success = false;
		response.errors.push(`${index}-event`);
		thisItemSuccess = false;
	}
	if (typeof body.tower !== 'string') {
		response.success = false;
		response.errors.push(`${index}-tower`);
		thisItemSuccess = false;
	}
	if (
		typeof body.radioId !== 'string' ||
		!/^[0-9]+$/.test(body.radioId)
	) {
		response.success = false;
		response.errors.push(`${index}-radioId`);
		thisItemSuccess = false;
	}
	if (
		typeof body.talkgroup !== 'string' ||
		!/^[0-9]*$/.test(body.talkgroup)
	) {
		response.success = false;
		response.errors.push(`${index}-talkgroup`);
		thisItemSuccess = false;
	}
	if (
		typeof body.talkgroupList !== 'string' ||
		!/^([0-9]*,?)+$/.test(body.talkgroupList)
	) {
		response.success = false;
		response.errors.push(`${index}-talkgroupList`);
		thisItemSuccess = false;
	}

	return thisItemSuccess;
}

async function handleEvent(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.trace('handleEvent', ...arguments);
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

	if (!response.success) {
		logger.error('handleEvent', '400', response);
	}

	return {
		statusCode: response.success ? 200 : 400,
		body: JSON.stringify(response)
	};
}

async function handleEvents(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.trace('handleEvents', ...arguments);
	// Validate the body
	validateBodyIsJson(event.body);

	// Parse the body
	const body: EventBody[] = JSON.parse(event.body as string);
	const response: GenericApiResponse = {
		success: true,
		errors: []
	};

	if (body.filter(event => event.radioId !== '-1').length > 0) {
		await firehose.putRecordBatch({
			DeliveryStreamName: FIREHOSE_NAME,
			Records: body
				.filter(event => event.radioId !== '-1')
				.filter((event, i) => validateEventBody(event, i, response))
				.map(event => ({
					Data: JSON.stringify(event)
				}))
		}).promise();
	}

	if (!response.success) {
		logger.error('handleEvents', event.body, response);
	}

	return {
		statusCode: response.success ? 200 : 400,
		body: JSON.stringify(response),
	};
}

export async function main(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
	logger.debug('main', ...arguments);
	const action = event.queryStringParameters?.action || 'none';

	try {
		switch (action) {
			case 'event':
				return await handleEvent(event);
			case 'events':
				return await handleEvents(event);
		}

		logger.error('main', 'Invalid action', action);
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
