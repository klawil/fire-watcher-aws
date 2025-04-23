import {
  beforeEach,
  describe, expect, it
} from '@jest/globals';
import { APIGatewayProxyEvent } from 'aws-lambda';

import {
  GetSecretValueCommand, SecretsManagerClientMock
} from '../../../../__mocks__/@aws-sdk/client-secrets-manager';
import {
  DynamoDBDocumentClientMock, GetCommand
} from '../../../../__mocks__/@aws-sdk/lib-dynamodb';
import { verify } from '../../../../__mocks__/jsonwebtoken';

import { generateApiEvent } from './_utils';

import { getCurrentUser } from '@/resources/api/v2/_base';

describe('resources/api/v2/department', () => {
  describe('handleResourceApi', () => {
    it.todo('Passes the event to the appropriate function when provided');

    it.todo('Returns a 403 if the appropriate method is not available');

    it.todo('Attaches a Content-Type header unless the status code is 204');

    it.todo('Does not attach a Content-Type header if the status code is 204');

    it.todo('Uses the Content-Type header from the function if provided');

    it.todo('Stringifies a JSON response');

    it.todo('Does not modify a string response');
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
    it.todo('Reads the cookies out of the cookie header');

    it.todo('Does not modify the cookie name or value in any way');

    it.todo('Handles cookies with a blank value');
  });

  describe('getFrontendUserObj', () => {
    it.todo('Returns only the allowed keys from the user object');
  });

  describe('getDeleteCookieHeader', () => {
    it.todo('Returns a cookie string that will result in the cookie being deleted');

    it.todo('Encodes the cookie name in a URL safe manner');
  });

  describe('getSetCookieHeader', () => {
    it.todo('Returns a cookie string that will result in the cookie being set');

    it.todo('Encodes the cookie name and value in a URL safe manner');
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

      // JWT secret mock
      SecretsManagerClientMock.setResult('getSecretValue', {
        SecretString: 'JWT-secret',
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
        SecretId: 'JWT_SECRET',
      });

      // Validate the token was verified
      expect(verify).toHaveBeenCalledTimes(1);
      expect(verify).toHaveBeenCalledWith(
        '1234567890',
        'JWT-secret'
      );

      // Validate the user was fetched from the DB
      expect(GetCommand).toHaveBeenCalledTimes(1);
      expect(GetCommand).toHaveBeenCalledWith({
        TableName: 'TABLE_USER',
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

      // JWT secret mock
      SecretsManagerClientMock.setResult('getSecretValue', {
        SecretString: 'JWT-secret',
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

      // JWT secret mock
      SecretsManagerClientMock.setResult('getSecretValue', {
        SecretString: 'JWT-secret',
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

      // JWT secret mock
      SecretsManagerClientMock.setResult('getSecretValue', {
        SecretString: 'JWT-secret',
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
        SecretId: 'JWT_SECRET',
      });

      // Validate the token was verified
      expect(verify).toHaveBeenCalledTimes(1);
      expect(verify).toHaveBeenCalledWith(
        '1234567890',
        'JWT-secret'
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

      // JWT secret mock
      SecretsManagerClientMock.setResult('getSecretValue', {
        SecretString: 'JWT-secret',
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
        SecretId: 'JWT_SECRET',
      });

      // Validate the token was verified
      expect(verify).toHaveBeenCalledTimes(1);
      expect(verify).toHaveBeenCalledWith(
        '1234567890',
        'JWT-secret'
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

      // JWT secret mock
      SecretsManagerClientMock.setResult('getSecretValue', {
        SecretString: 'JWT-secret',
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
        SecretId: 'JWT_SECRET',
      });

      // Validate the token was verified
      expect(verify).toHaveBeenCalledTimes(1);
      expect(verify).toHaveBeenCalledWith(
        '1234567890',
        'JWT-secret'
      );

      // Validate the user was fetched from the DB
      expect(GetCommand).toHaveBeenCalledTimes(1);
      expect(GetCommand).toHaveBeenCalledWith({
        TableName: 'TABLE_USER',
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
    it.todo('Returns an error if the body is null');

    it.todo('Returns an error if the object is not valid JSON');

    it.todo('Returns an error if the validation fails');

    it.todo('Validates the object if a validator is provided');
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
