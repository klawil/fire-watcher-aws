import { APIGatewayProxyResult } from 'aws-lambda';

export interface ApiResponseBase {
	success: boolean;
	message?: string;
}

export const unauthorizedApiResponseBody: ApiResponseBase = {
	success: false,
	message: 'You are not permitted to access this area',
};

export const unauthorizedApiResponse: APIGatewayProxyResult = {
	statusCode: 403,
	body: JSON.stringify(unauthorizedApiResponseBody),
};
