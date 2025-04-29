import { APIGatewayProxyEvent } from 'aws-lambda';
import {
  beforeEach,
  describe, expect, it, vi
} from 'vitest';

import {
  GetSecretValueCommand
} from '../../../../__mocks__/@aws-sdk/client-secrets-manager';
import {
  DynamoDBDocumentClientMock, GetCommand
} from '../../../../__mocks__/@aws-sdk/lib-dynamodb';
import { verify } from '../../../../__mocks__/jsonwebtoken';

import { generateApiEvent } from './_utils';

import {
  getCookies, getCurrentUser,
  getDeleteCookieHeader,
  getFrontendUserObj,
  getSetCookieHeader,
  handleResourceApi,
  parseJsonBody
} from '@/resources/api/v2/_base';
import { api403Response } from '@/types/api/_shared';
import {
  LogLevel,
  getLogger
} from '@/utils/common/logger';

describe('resources/api/v2/_base', () => {
  describe('handleResourceApi', () => {
    let handlers: Parameters<typeof handleResourceApi>[0];
    beforeEach(() => {
      handlers = {
        POST: vi.fn().mockReturnValue(Promise.resolve([
          200,
          {},
        ])) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        PATCH: vi.fn().mockReturnValue(Promise.resolve([
          201,
          {},
        ])) as any, // eslint-disable-line @typescript-eslint/no-explicit-any
      };
    });

    it('Passes the event to the appropriate function when provided', async () => {
      const event = generateApiEvent({
        method: 'POST',
        path: '',
      });

      await handleResourceApi(
        handlers,
        event
      );

      expect(handlers.POST).toHaveBeenCalledTimes(1);
      expect(handlers.POST).toHaveBeenCalledWith(event);

      expect(handlers.PATCH).toHaveBeenCalledTimes(0);
    });

    it('Returns a 403 if the appropriate method is not available', async () => {
      const event = generateApiEvent({
        method: 'GET',
        path: '',
      });

      const result = await handleResourceApi(
        handlers,
        event
      );

      expect(handlers.POST).toHaveBeenCalledTimes(0);
      expect(handlers.PATCH).toHaveBeenCalledTimes(0);
      expect(result).toEqual(api403Response);
    });

    it('Attaches a Content-Type header if the status code is not 204', async () => {
      const event = generateApiEvent({
        method: 'POST',
        path: '',
      });

      const result = await handleResourceApi(
        handlers,
        event
      );

      expect(result).toEqual({
        statusCode: 200,
        body: '{}',
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('Does not attach a Content-Type header if the status code is 204', async () => {
      const event = generateApiEvent({
        method: 'PATCH',
        path: '',
      });

      (handlers.PATCH as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .mockReturnValue([
          204,
          '',
        ]);

      const result = await handleResourceApi(
        handlers,
        event
      );

      expect(result).toEqual({
        statusCode: 204,
        body: '',
      });
    });

    it('Uses the Content-Type header from the function if provided', async () => {
      const event = generateApiEvent({
        method: 'PATCH',
        path: '',
      });

      (handlers.PATCH as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .mockReturnValue([
          200,
          '<Response>Test</Response>',
          null,
          'application/xml',
        ]);

      const result = await handleResourceApi(
        handlers,
        event
      );

      expect(result).toEqual({
        statusCode: 200,
        body: '<Response>Test</Response>',
        headers: {
          'Content-Type': 'application/xml',
        },
      });
    });

    it('Logs an error if the status code is not 200 or 204', async () => {
      const logger = getLogger('');
      logger.setLevel(LogLevel.Error);

      vi.spyOn(console, 'error').mockImplementation(() => {});

      const event = generateApiEvent({
        method: 'PATCH',
        path: '',
      });

      (handlers.PATCH as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .mockReturnValue([
          400,
          [
            'key',
            'key2',
          ],
        ]);

      const result = await handleResourceApi(
        handlers,
        event
      );

      expect(result).toEqual({
        statusCode: 400,
        body: '["key","key2"]',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      expect(console.error).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith(
        '[ api/v2/_base ]',
        'PATCH Error - 400',
        [
          'key',
          'key2',
        ],
        event
      );
    });
  });

  describe('mergeDynamoQueriesDocClient', () => {
    it.todo('Runs a query for each config provided');

    it.todo('Combines the query results into one object');

    it.todo('Sorts the items by the provided sorting key');

    it.todo('Follows the limit set in the base config');

    it.todo('Returns the appropriate keys to get the next set of items');

    it.todo('Reverses the array if the configuration calls for it');
  });

  describe('getCookies', () => {
    it('Reads the cookies out of the cookie header', () => {
      expect(getCookies(generateApiEvent({
        method: 'GET',
        path: '',
        headers: {
          Cookie: 'cookieA=valueA; cookieB=valueB; cookieC=valueC',
        },
      }))).toEqual({
        cookieA: 'valueA',
        cookieB: 'valueB',
        cookieC: 'valueC',
      });
    });

    it('Does not modify the cookie name or value in any way', () => {
      expect(getCookies(generateApiEvent({
        method: 'GET',
        path: '',
        headers: {
          Cookie: 'cookie%20A=value%20A; cookie B=value B; cookieC=value!C',
        },
      }))).toEqual({
        'cookie%20A': 'value%20A',
        'cookie B': 'value B',
        cookieC: 'value!C',
      });
    });

    it('Handles cookies with a blank value', () => {
      expect(getCookies(generateApiEvent({
        method: 'GET',
        path: '',
        headers: {
          Cookie: 'cookieA; cookieB=; cookieC=value!C',
        },
      }))).toEqual({
        cookieA: '',
        cookieB: '',
        cookieC: 'value!C',
      });
    });

    it('Ignores cookies without a key', () => {
      expect(getCookies(generateApiEvent({
        method: 'GET',
        path: '',
        headers: {
          Cookie: 'cookieA; =; =valueC',
        },
      }))).toEqual({
        cookieA: '',
      });
    });
  });

  describe('getFrontendUserObj', () => {
    it('Returns only the allowed keys from the user object', () => {
      expect(getFrontendUserObj({
        phone: 5555555555,
        Baca: {
          active: true,
          admin: true,
          callSign: 'BG-ID',
        },
        isDistrictAdmin: true,
        isTest: true,
        getApiAlerts: true,
        code: '123456',
        codeExpiry: 1234567,
      })).toEqual({
        phone: 5555555555,
        Baca: {
          active: true,
          admin: true,
          callSign: 'BG-ID',
        },
        isDistrictAdmin: true,
        isTest: true,
        getApiAlerts: true,
      });
    });
  });

  describe('getDeleteCookieHeader', () => {
    it('Returns a cookie string that will result in the cookie being deleted', () => {
      expect(getDeleteCookieHeader('test-cookie'))
        .toEqual('test-cookie=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    });

    it('Encodes the cookie name in a URL safe manner', () => {
      expect(getDeleteCookieHeader('test cookie'))
        .toEqual('test%20cookie=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
    });
  });

  describe('getSetCookieHeader', () => {
    it('Returns a cookie string that will result in the cookie being set', () => {
      expect(getSetCookieHeader('test-cookie', 'test-value', 20))
        .toEqual('test-cookie=test-value; Secure; SameSite=None; Path=/; Max-Age=20');
    });

    it('Encodes the cookie name and value in a URL safe manner', () => {
      expect(getSetCookieHeader('test cookie', 'test;value', 20))
        .toEqual('test%20cookie=test%3Bvalue; Secure; SameSite=None; Path=/; Max-Age=20');
    });
  });

  describe('getCurrentUser', () => {
    let req: APIGatewayProxyEvent;
    beforeEach(() => {
      req = generateApiEvent({
        method: 'GET',
        path: '/api/v2/test/',
        withUser: true,
      });
    });

    it('Uses cookies to retrieve the current user and their permissions', async () => {
      // JWT library mock
      verify.mockReturnValue({
        phone: 5555555555,
      });

      // DynamoDB get
      DynamoDBDocumentClientMock.setResult('get', {
        Item: {
          phone: 5555555555,
          code: 631547,
          Baca: {
            active: true,
          },
        },
      });

      const [
        user,
        perms,
        headers,
      ] = await getCurrentUser(req);

      // Validate the JWT secret was retrieved
      expect(GetSecretValueCommand).toHaveBeenCalledTimes(1);
      expect(GetSecretValueCommand).toHaveBeenCalledWith({
        SecretId: 'JWT_SECRET_VAL',
      });

      // Validate the token was verified
      expect(verify).toHaveBeenCalledTimes(1);
      expect(verify).toHaveBeenCalledWith(
        '1234567890',
        'JWT-Secret-Value'
      );

      // Validate the user was fetched from the DB
      expect(GetCommand).toHaveBeenCalledTimes(1);
      expect(GetCommand).toHaveBeenCalledWith({
        TableName: 'TABLE_USER_VAL',
        Key: {
          phone: 5555555555,
        },
      });

      // Validate the response - front end user object
      expect(user).toEqual({
        phone: 5555555555,
        Baca: {
          active: true,
        },
      });

      // Validate the response - permissions
      expect(perms).toEqual({
        isUser: true,
        isAdmin: false,
        isDistrictAdmin: false,
        activeDepartments: [ 'Baca', ],
        adminDepartments: [],
      });

      // Validate the response - headers
      expect(headers).toEqual({});
    });

    it('Deletes cookies if the cofrn-user cookie is not present', async () => {
      // JWT library mock
      verify.mockReturnValue('none');

      // DynamoDB get
      DynamoDBDocumentClientMock.setResult('get', {
        Item: {
          phone: 5555555555,
          code: 631547,
          Baca: {
            active: true,
          },
        },
      });

      // Event to pass into the function
      const req = generateApiEvent({
        method: 'GET',
        path: '/api/v2/test/',
        headers: {
          Cookie: 'cofrn-other=5555555555; cofrn-token=1234567890',
        },
      });

      const [
        user,
        perms,
        headers,
      ] = await getCurrentUser(req);

      // Validate that no steps were taken
      expect(GetSecretValueCommand).toHaveBeenCalledTimes(0);
      expect(verify).toHaveBeenCalledTimes(0);
      expect(GetCommand).toHaveBeenCalledTimes(0);

      // Validate the response - front end user object
      expect(user).toEqual(null);

      // Validate the response - permissions
      expect(perms).toEqual({
        isUser: false,
        isAdmin: false,
        isDistrictAdmin: false,
        activeDepartments: [],
        adminDepartments: [],
      });

      // Validate the response - headers
      expect(headers).toEqual({
        'Set-Cookie': [
          'cofrn-other=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
          'cofrn-token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        ],
      });
    });

    it('Deletes cookies if the cofrn-token cookie is not present', async () => {
      // JWT library mock
      verify.mockReturnValue('none');

      // DynamoDB get
      DynamoDBDocumentClientMock.setResult('get', {
        Item: {
          phone: 5555555555,
          code: 631547,
          Baca: {
            active: true,
          },
        },
      });

      // Event to pass into the function
      const req = generateApiEvent({
        method: 'GET',
        path: '/api/v2/test/',
        headers: {
          Cookie: 'cofrn-other=5555555555; cofrn-user=1234567890',
        },
      });

      const [
        user,
        perms,
        headers,
      ] = await getCurrentUser(req);

      // Validate that no steps were taken
      expect(GetSecretValueCommand).toHaveBeenCalledTimes(0);
      expect(verify).toHaveBeenCalledTimes(0);
      expect(GetCommand).toHaveBeenCalledTimes(0);

      // Validate the response - front end user object
      expect(user).toEqual(null);

      // Validate the response - permissions
      expect(perms).toEqual({
        isUser: false,
        isAdmin: false,
        isDistrictAdmin: false,
        activeDepartments: [],
        adminDepartments: [],
      });

      // Validate the response - headers
      expect(headers).toEqual({
        'Set-Cookie': [
          'cofrn-other=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
          'cofrn-user=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        ],
      });
    });

    it('Deletes cookies if the token validation throws an error', async () => {
      // JWT library mock
      verify.mockImplementation(() => {
        throw new Error('Invalid');
      });

      // DynamoDB get
      DynamoDBDocumentClientMock.setResult('get', {
        Item: {
          phone: 5555555555,
          code: 631547,
          Baca: {
            active: true,
          },
        },
      });

      const [
        user,
        perms,
        headers,
      ] = await getCurrentUser(req);

      // Validate the JWT secret was retrieved
      expect(GetSecretValueCommand).toHaveBeenCalledTimes(1);
      expect(GetSecretValueCommand).toHaveBeenCalledWith({
        SecretId: 'JWT_SECRET_VAL',
      });

      // Validate the token was verified
      expect(verify).toHaveBeenCalledTimes(1);
      expect(verify).toHaveBeenCalledWith(
        '1234567890',
        'JWT-Secret-Value'
      );

      // Validate that nothing was fetched from the database
      expect(GetCommand).toHaveBeenCalledTimes(0);

      // Validate the response - front end user object
      expect(user).toEqual(null);

      // Validate the response - permissions
      expect(perms).toEqual({
        isUser: false,
        isAdmin: false,
        isDistrictAdmin: false,
        activeDepartments: [],
        adminDepartments: [],
      });

      // Validate the response - headers
      expect(headers).toEqual({
        'Set-Cookie': [
          'cofrn-user=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
          'cofrn-token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        ],
      });
    });

    it('Deletes cookies if the token validation returns an object without a phone', async () => {
      // JWT library mock
      verify.mockReturnValue({});

      // DynamoDB get
      DynamoDBDocumentClientMock.setResult('get', {
        Item: {
          phone: 5555555555,
          code: 631547,
          Baca: {
            active: true,
          },
        },
      });

      const [
        user,
        perms,
        headers,
      ] = await getCurrentUser(req);

      // Validate the JWT secret was retrieved
      expect(GetSecretValueCommand).toHaveBeenCalledTimes(1);
      expect(GetSecretValueCommand).toHaveBeenCalledWith({
        SecretId: 'JWT_SECRET_VAL',
      });

      // Validate the token was verified
      expect(verify).toHaveBeenCalledTimes(1);
      expect(verify).toHaveBeenCalledWith(
        '1234567890',
        'JWT-Secret-Value'
      );

      // Validate that nothing was fetched from the database
      expect(GetCommand).toHaveBeenCalledTimes(0);

      // Validate the response - front end user object
      expect(user).toEqual(null);

      // Validate the response - permissions
      expect(perms).toEqual({
        isUser: false,
        isAdmin: false,
        isDistrictAdmin: false,
        activeDepartments: [],
        adminDepartments: [],
      });

      // Validate the response - headers
      expect(headers).toEqual({
        'Set-Cookie': [
          'cofrn-user=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
          'cofrn-token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        ],
      });
    });

    it('Deletes cookies if the user is not found in the database', async () => {
      // JWT library mock
      verify.mockReturnValue({
        phone: 5555555555,
      });

      // DynamoDB get
      DynamoDBDocumentClientMock.setResult('get', {});

      const [
        user,
        perms,
        headers,
      ] = await getCurrentUser(req);

      // Validate the JWT secret was retrieved
      expect(GetSecretValueCommand).toHaveBeenCalledTimes(1);
      expect(GetSecretValueCommand).toHaveBeenCalledWith({
        SecretId: 'JWT_SECRET_VAL',
      });

      // Validate the token was verified
      expect(verify).toHaveBeenCalledTimes(1);
      expect(verify).toHaveBeenCalledWith(
        '1234567890',
        'JWT-Secret-Value'
      );

      // Validate the user was fetched from the DB
      expect(GetCommand).toHaveBeenCalledTimes(1);
      expect(GetCommand).toHaveBeenCalledWith({
        TableName: 'TABLE_USER_VAL',
        Key: {
          phone: 5555555555,
        },
      });

      // Validate the response - front end user object
      expect(user).toEqual(null);

      // Validate the response - permissions
      expect(perms).toEqual({
        isUser: false,
        isAdmin: false,
        isDistrictAdmin: false,
        activeDepartments: [],
        adminDepartments: [],
      });

      // Validate the response - headers
      expect(headers).toEqual({
        'Set-Cookie': [
          'cofrn-user=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
          'cofrn-token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
        ],
      });
    });
  });

  describe('parseJsonBody', () => {
    it('Returns an error if the body is null', () => {
      expect(parseJsonBody(null)).toEqual([
        null,
        [],
      ]);
    });

    it('Returns an error if the object is not valid JSON', () => {
      expect(parseJsonBody('test')).toEqual([
        null,
        [],
      ]);
    });

    it('Returns an error if the validation fails', () => {
      expect(parseJsonBody<{
        key: number;
      }>(
        JSON.stringify({
          key: 'value',
        }),
        {
          key: {
            required: true,
            types: {
              number: {},
            },
          },
        }
      )).toEqual([
        null,
        [ 'key', ],
      ]);
    });

    it('Validates the object if a validator is provided', () => {
      expect(parseJsonBody<{
        key: number;
      }>(
        JSON.stringify({
          key: 1234,
        }),
        {
          key: {
            required: true,
            types: {
              number: {},
            },
          },
        }
      )).toEqual([
        { key: 1234, },
        [],
      ]);
    });

    it('Does not validate the object if no validator is provided', () => {
      expect(parseJsonBody(
        JSON.stringify({
          key: 'test',
        })
      )).toEqual([
        { key: 'test', },
        [],
      ]);
    });
  });

  describe('validateRequest', () => {
    it.todo('Validates and returns the params');

    it.todo('Validates and returns the body');

    it.todo('Parses the body from JSON if appropriate');

    it.todo('Validates and returns the query');

    it.todo('Returns validation errors from the params');

    it.todo('Returns validation errors from the body');

    it.todo('Returns validation errors from the query');

    it.todo('Returns validation errors from all 3');
  });
});
