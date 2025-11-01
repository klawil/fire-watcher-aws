import {
  APIGatewayProxyEvent, APIGatewayProxyResult
} from 'aws-lambda';
import { Api } from 'ts-oas';

import { getCurrentUser } from './_utils';

import { api403Response } from '@/types/api/_shared';
import {
  FrontendUserObject
} from '@/types/api/users';
import { UserPermissions } from '@/types/backend/user';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('api/v2/_base');

export type LambdaApiFunction<T extends Api> = (
  event: APIGatewayProxyEvent,
  user: Readonly<FrontendUserObject | null>,
  userPerms: Readonly<UserPermissions>,
) => Promise<[
  keyof T['responses'],
  T['responses'][keyof T['responses']],
  (APIGatewayProxyResult['multiValueHeaders'] | null)?,
  string?
]>;

export async function handleResourceApi(
  handlers: {
    [key in Api['method']]?: (
      event: APIGatewayProxyEvent,
      user: Readonly<FrontendUserObject | null>,
      userPerms: Readonly<UserPermissions>,
    ) => Promise<[
      number,
      unknown,
      (APIGatewayProxyResult['multiValueHeaders'] | null)?,
      string?
    ]>;
  },
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  logger.trace('handleResourceApi', ...arguments);
  const method = event.httpMethod as Api['method'];
  if (typeof handlers[method] !== 'undefined') {
    // Get user information
    const [
      user,
      userPerms,
      userHeaders,
    ] = await getCurrentUser(event);

    // Run the function
    const [
      statusCode,
      responseBody,
      responseHeaders,
      contentType = 'application/json',
    ] = await handlers[method](event, user, userPerms);

    // Log details for any errors
    if (
      statusCode !== 200 &&
      statusCode !== 204 &&
      statusCode !== 205
    ) {
      logger.error(`${method} Error - ${statusCode}`, responseBody, event);
    }

    // Build the response
    const response: APIGatewayProxyResult = {
      statusCode,
      body: JSON.stringify(responseBody),
    };
    if (responseHeaders) {
      response.multiValueHeaders = responseHeaders;
    } else {
      response.multiValueHeaders = userHeaders;
    }
    if (statusCode !== 204) {
      response.headers = {
        'Content-Type': contentType,
      };
    }
    if (typeof responseBody === 'string') {
      response.body = responseBody;
    }

    return response;
  }

  return api403Response;
}
