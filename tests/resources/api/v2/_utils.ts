import { APIGatewayProxyEvent } from 'aws-lambda';
import { Api } from 'ts-oas';

export function generateApiEvent({
  method,
  path,
  body = null,
  headers = {},
  multiValueHeaders = {},
  pathParameters = {},
  queryStringParameters = {},
  multiValueQueryStringParameters = {},
  withUser = false,
}: {
  method: Api['method'];
  path: string;
  body?: string | null;
  headers?: APIGatewayProxyEvent['headers'];
  multiValueHeaders?: APIGatewayProxyEvent['multiValueHeaders'];
  pathParameters?: APIGatewayProxyEvent['pathParameters'];
  queryStringParameters?: APIGatewayProxyEvent['queryStringParameters'];
  multiValueQueryStringParameters?: APIGatewayProxyEvent['multiValueQueryStringParameters'];
  withUser?: boolean;
}): APIGatewayProxyEvent {
  return {
    body,
    headers: {
      ...withUser
        ? {
          Cookie: 'cofrn-user=5555555555; cofrn-token=1234567890',
        }
        : {},
      ...headers,
    },
    multiValueHeaders,
    httpMethod: method,
    isBase64Encoded: false,
    path,
    pathParameters,
    queryStringParameters,
    multiValueQueryStringParameters,
    stageVariables: null,
    requestContext: {
      accountId: '',
      apiId: '',
      protocol: '',
      httpMethod: method,
      authorizer: null,
      stage: '',
      path: '',
      requestId: '',
      requestTimeEpoch: 0,
      resourceId: '',
      resourcePath: '',
      identity: {
        accessKey: null,
        accountId: null,
        apiKey: null,
        apiKeyId: null,
        caller: null,
        clientCert: null,
        cognitoAuthenticationProvider: null,
        cognitoAuthenticationType: null,
        cognitoIdentityId: null,
        cognitoIdentityPoolId: null,
        principalOrgId: null,
        sourceIp: '',
        user: null,
        userAgent: null,
        userArn: null,
      },
    },
    resource: '',
  };
}
