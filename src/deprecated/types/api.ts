import { APIGatewayProxyResult } from 'aws-lambda';

import { ApiResponseBase } from '@/deprecated/common/common';

/**
 * @deprecated The method should not be used
 */
export const unauthorizedApiResponseBody: ApiResponseBase = {
  success: false,
  message: 'You are not permitted to access this area',
};

/**
 * @deprecated The method should not be used
 */
export const unauthorizedApiResponse: APIGatewayProxyResult = {
  statusCode: 403,
  body: JSON.stringify(unauthorizedApiResponseBody),
};
