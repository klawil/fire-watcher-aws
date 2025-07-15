import {
  APIGatewayProxyEvent, APIGatewayProxyResult
} from 'aws-lambda';
import { Api } from 'ts-oas';
import {
  expect, it, vi
} from 'vitest';

import { getCurrentUser } from '@/resources/api/v2/_utils';
import { FullUserObject } from '@/types/api/users';
import { UserPermissions } from '@/types/backend/user';

interface ApiEventConfig {
  method: Api['method'];
  path: string;
  body?: string | null;
  headers?: APIGatewayProxyEvent['headers'];
  multiValueHeaders?: APIGatewayProxyEvent['multiValueHeaders'];
  pathParameters?: APIGatewayProxyEvent['pathParameters'];
  queryStringParameters?: APIGatewayProxyEvent['queryStringParameters'];
  multiValueQueryStringParameters?: APIGatewayProxyEvent['multiValueQueryStringParameters'];
  withUser?: boolean;
}

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
}: ApiEventConfig): APIGatewayProxyEvent {
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

export function mockUserRequest(
  req: APIGatewayProxyEvent,
  isActive: boolean = true,
  isAdmin: boolean = false,
  isDistrictAdmin: boolean = false,
  canEditNames: boolean = false
) {
  // Mock the returned user
  const userPerms: UserPermissions = {
    isUser: isActive,
    isAdmin,
    isDistrictAdmin,
    canEditNames,
    activeDepartments: [ 'Baca', ],
    adminDepartments: [],
  };
  const userObj: FullUserObject = {
    phone: 5555555555,
    fName: 'TestF',
    lName: 'TestL',
    Baca: {
      active: isActive,
      callSign: 'BG-TEST',
    },
  };
  if (isAdmin) {
    userObj.Baca = {
      ...userObj.Baca || {},
      admin: true,
    };
  }
  if (isDistrictAdmin) {
    userObj.isDistrictAdmin = true;
  }
  vi.mocked(getCurrentUser).mockResolvedValue([
    { ...userObj, },
    { ...userPerms, },
    {},
  ]);
}

export function testUserAuth(
  baseReqConfig: ApiEventConfig,
  main: (event: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult>,
  requireAdmin: boolean = false
) {

  it('Returns a 401 error if there is not a logged in user', async () => {
    const req = generateApiEvent(baseReqConfig);

    expect(await main(req)).toEqual({
      statusCode: 401,
      body: JSON.stringify({
        message: 'Missing Authentication Token',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      multiValueHeaders: {},
    });

    // Make sure the current user was fetched
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('Returns a 403 error if the logged in user is not active', async () => {
    // Build the request
    const req = generateApiEvent(baseReqConfig);
    mockUserRequest(req, false);

    // await main(req);
    expect(await main(req)).toEqual({
      statusCode: 403,
      body: JSON.stringify({
        message: 'Missing Authentication Token',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
      multiValueHeaders: {},
    });

    // Make sure the current user was fetched
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
  });

  if (requireAdmin) {
    it('Returns a 403 error if the logged in user is not an admin', async () => {
      // Build the request
      const req = generateApiEvent(baseReqConfig);
      mockUserRequest(req, true);

      expect(await main(req)).toEqual({
        statusCode: 403,
        body: JSON.stringify({
          message: 'Missing Authentication Token',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        multiValueHeaders: {},
      });

      // Make sure the current user was fetched
      expect(getCurrentUser).toHaveBeenCalledTimes(1);
    });
  }
}
