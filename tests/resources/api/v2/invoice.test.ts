import {
  describe, expect, it
} from 'vitest';

import { S3Mock } from '../../../../__mocks__/@aws-sdk/client-s3';
import {
  DynamoDBDocumentClientMock,
  GetCommand,
  UpdateCommand
} from '../../../../__mocks__/@aws-sdk/lib-dynamodb';

import {
  generateApiEvent,
  mockUserRequest,
  testUserAuth
} from './_utils';

import { main } from '@/resources/api/v2/invoice';

describe('resources/api/v2/invoice', () => {
  describe('GET', () => {
    it('Allows district admins without department admin roles', async () => {
      const req = generateApiEvent({
        method: 'GET',
        path: '',
        pathParameters: {
          id: 'inv-001',
        },
      });
      mockUserRequest(req, true, false, true);

      DynamoDBDocumentClientMock.setResult('get', {
        Item: {
          id: 'inv-001',
          department: 'Baca',
          s3Location: 'invoices/inv-001.pdf',
        },
      });
      S3Mock.setResult('get', {
        Body: {
          transformToByteArray: async () => Uint8Array.from([ 1, ]),
        },
      });

      const result = await main(req);
      expect(result.statusCode).toEqual(200);
      expect(result.isBase64Encoded).toEqual(true);
    });

    it('Returns 400 for invoice ids with unsafe characters', async () => {
      const req = generateApiEvent({
        method: 'GET',
        path: '',
        pathParameters: {
          id: 'inv bad',
        },
      });
      mockUserRequest(req, true, true, true);

      expect(await main(req)).toEqual({
        statusCode: 400,
        body: JSON.stringify({
          message: 'Invalid request body',
          errors: [ 'id', ],
        }),
        multiValueHeaders: {},
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('Returns a base64 encoded PDF response for an accessible invoice', async () => {
      const req = generateApiEvent({
        method: 'GET',
        path: '',
        pathParameters: {
          id: 'inv-001',
        },
      });
      mockUserRequest(req, true, true, true);

      DynamoDBDocumentClientMock.setResult('get', {
        Item: {
          id: 'inv-001',
          department: 'Baca',
          s3Location: 'invoices/inv-001.pdf',
        },
      });
      S3Mock.setResult('get', {
        Body: {
          transformToByteArray: async () => Uint8Array.from([
            1,
            2,
            3,
          ]),
        },
      });

      expect(await main(req)).toEqual({
        statusCode: 200,
        body: Buffer.from([
          1,
          2,
          3,
        ]).toString('base64'),
        isBase64Encoded: true,
        multiValueHeaders: {
          'content-disposition': [ 'attachment; filename="invoice-inv-001.pdf"', ],
          'content-type': [ 'application/pdf', ],
        },
        headers: {
          'Content-Type': 'application/pdf',
        },
      });

      expect(GetCommand).toHaveBeenCalledWith({
        TableName: 'TABLE_INVOICE_VAL',
        Key: {
          id: 'inv-001',
        },
      });
    });

    it('Returns 403 when invoice department is missing', async () => {
      const req = generateApiEvent({
        method: 'GET',
        path: '',
        pathParameters: {
          id: 'inv-001',
        },
      });
      mockUserRequest(req, true, true, true);

      DynamoDBDocumentClientMock.setResult('get', {
        Item: {
          id: 'inv-001',
          s3Location: 'invoices/inv-001.pdf',
        },
      });

      expect(await main(req)).toEqual({
        statusCode: 403,
        body: JSON.stringify({
          message: 'Missing Authentication Token',
        }),
        multiValueHeaders: {},
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('Returns 500 for unexpected S3 failures', async () => {
      const req = generateApiEvent({
        method: 'GET',
        path: '',
        pathParameters: {
          id: 'inv-001',
        },
      });
      mockUserRequest(req, true, true, true);

      DynamoDBDocumentClientMock.setResult('get', {
        Item: {
          id: 'inv-001',
          department: 'Baca',
          s3Location: 'invoices/inv-001.pdf',
        },
      });
      S3Mock.send.mockRejectedValueOnce(new Error('timeout'));

      expect(await main(req)).toEqual({
        statusCode: 500,
        body: JSON.stringify({
          message: 'Internal server error',
        }),
        multiValueHeaders: {},
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    testUserAuth({
      method: 'GET',
      path: '',
      pathParameters: {
        id: 'inv-001',
      },
    }, main, true);
  });

  describe('PATCH', () => {
    it('Returns 400 for future paidDate values', async () => {
      const req = generateApiEvent({
        method: 'PATCH',
        path: '',
        pathParameters: {
          id: 'inv-001',
        },
        body: JSON.stringify({
          paidDate: '9999-01-01',
        }),
      });
      mockUserRequest(req, true, true, true);

      expect(await main(req)).toEqual({
        statusCode: 400,
        body: JSON.stringify({
          message: 'Invalid request body',
          errors: [ 'paidDate: Date cannot be in the future', ],
        }),
        multiValueHeaders: {},
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('Updates paidDate for district admins', async () => {
      const req = generateApiEvent({
        method: 'PATCH',
        path: '',
        pathParameters: {
          id: 'inv-001',
        },
        body: JSON.stringify({
          paidDate: '2026-05-01',
        }),
      });
      mockUserRequest(req, true, true, true);

      DynamoDBDocumentClientMock.setResult('get', {
        Item: {
          id: 'inv-001',
          department: 'Baca',
        },
      });
      DynamoDBDocumentClientMock.setResult('update', {
        Attributes: {
          id: 'inv-001',
          department: 'Baca',
          paidDate: '2026-05-01',
        },
      });

      expect(await main(req)).toEqual({
        statusCode: 200,
        body: JSON.stringify({
          id: 'inv-001',
          department: 'Baca',
          paidDate: '2026-05-01',
        }),
        multiValueHeaders: {},
        headers: {
          'Content-Type': 'application/json',
        },
      });

      expect(UpdateCommand).toHaveBeenCalledWith({
        TableName: 'TABLE_INVOICE_VAL',
        Key: {
          id: 'inv-001',
        },
        ExpressionAttributeNames: {
          '#paidDate': 'paidDate',
        },
        ExpressionAttributeValues: {
          ':paidDate': '2026-05-01',
        },
        UpdateExpression: 'SET #paidDate = :paidDate',
        ReturnValues: 'ALL_NEW',
      });
    });

    it('Clears paidDate when paidDate is null', async () => {
      const req = generateApiEvent({
        method: 'PATCH',
        path: '',
        pathParameters: {
          id: 'inv-001',
        },
        body: JSON.stringify({
          paidDate: null,
        }),
      });
      mockUserRequest(req, true, true, true);

      DynamoDBDocumentClientMock.setResult('get', {
        Item: {
          id: 'inv-001',
          department: 'Baca',
          paidDate: '2026-04-29',
        },
      });
      DynamoDBDocumentClientMock.setResult('update', {
        Attributes: {
          id: 'inv-001',
          department: 'Baca',
        },
      });

      expect(await main(req)).toEqual({
        statusCode: 200,
        body: JSON.stringify({
          id: 'inv-001',
          department: 'Baca',
        }),
        multiValueHeaders: {},
        headers: {
          'Content-Type': 'application/json',
        },
      });

      expect(UpdateCommand).toHaveBeenCalledWith({
        TableName: 'TABLE_INVOICE_VAL',
        Key: {
          id: 'inv-001',
        },
        ExpressionAttributeNames: {
          '#paidDate': 'paidDate',
        },
        UpdateExpression: 'REMOVE #paidDate',
        ReturnValues: 'ALL_NEW',
      });
    });

    it('Returns 400 when no updatable fields are provided', async () => {
      const req = generateApiEvent({
        method: 'PATCH',
        path: '',
        pathParameters: {
          id: 'inv-001',
        },
        body: JSON.stringify({}),
      });
      mockUserRequest(req, true, true, true);

      expect(await main(req)).toEqual({
        statusCode: 400,
        body: JSON.stringify({
          message: 'Invalid request body',
          errors: [ 'No updatable fields were provided', ],
        }),
        multiValueHeaders: {},
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });
  });
});
