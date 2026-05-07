import {
  describe, expect, it
} from 'vitest';

import {
  DynamoDBDocumentClientMock,
  QueryCommand,
  ScanCommand
} from '../../../../__mocks__/@aws-sdk/lib-dynamodb';

import {
  generateApiEvent,
  mockUserRequest,
  testUserAuth
} from './_utils';

import { main } from '@/resources/api/v2/invoices';

describe('resources/api/v2/invoices', () => {
  describe('GET', () => {
    it('Returns 400 for an invalid limit', async () => {
      const req = generateApiEvent({
        method: 'GET',
        path: '',
        queryStringParameters: {
          limit: '0',
        },
      });
      mockUserRequest(req, true, true, true);

      expect(await main(req)).toEqual({
        statusCode: 400,
        multiValueHeaders: {},
        body: JSON.stringify({
          message: 'Invalid request body',
          errors: [ 'limit', ],
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('Uses Query with limit, cursor, and date filters for a single department', async () => {
      const cursor = {
        id: 'inv-001',
        department: 'Baca',
        generatedDate: '2026-01-01',
      };
      const req = generateApiEvent({
        method: 'GET',
        path: '',
        queryStringParameters: {
          departments: 'Baca',
          limit: '10',
          before: '2026-05-01',
          after: '2026-01-01',
          lastKey: Buffer.from(JSON.stringify(cursor)).toString('base64'),
        },
      });
      mockUserRequest(req, true, true, true);

      DynamoDBDocumentClientMock.setResult('query', {
        Items: [
          {
            id: 'inv-002',
            department: 'Baca',
          },
        ],
        LastEvaluatedKey: {
          id: 'inv-002',
          department: 'Baca',
          generatedDate: '2026-02-01',
        },
      });

      const response = await main(req);
      expect(response).toEqual({
        statusCode: 200,
        multiValueHeaders: {},
        body: response.body,
        headers: {
          'Content-Type': 'application/json',
        },
      });
      expect(JSON.parse(response.body)).toEqual({
        invoices: [
          {
            id: 'inv-002',
            department: 'Baca',
          },
        ],
        lastItem: Buffer.from(JSON.stringify({
          id: 'inv-002',
          department: 'Baca',
          generatedDate: '2026-02-01',
        })).toString('base64'),
      });

      expect(QueryCommand).toHaveBeenCalledWith({
        TableName: 'TABLE_INVOICE_VAL',
        IndexName: 'departmentIndex',
        KeyConditionExpression: '#dept = :dept',
        ExpressionAttributeNames: {
          '#dept': 'department',
          '#endDate': 'endDate',
          '#startDate': 'startDate',
        },
        ExpressionAttributeValues: {
          ':dept': 'Baca',
          ':beforeDate': '2026-05-01',
          ':afterDate': '2026-01-01',
        },
        FilterExpression: '#endDate < :beforeDate AND #startDate > :afterDate',
        ScanIndexForward: false,
        Limit: 10,
        ExclusiveStartKey: cursor,
      });
    });

    it('Uses Scan with department/date filter when multiple departments are requested', async () => {
      const req = generateApiEvent({
        method: 'GET',
        path: '',
        queryStringParameters: {
          departments: 'Baca,Crestone',
          before: '2026-05-01',
          after: '2026-01-01',
        },
      });
      mockUserRequest(req, true, true, true);

      DynamoDBDocumentClientMock.setResult('scan', {
        Items: [
          {
            id: 'inv-003',
            department: 'Crestone',
          },
        ],
      });

      const response = await main(req);
      expect(response).toEqual({
        statusCode: 200,
        multiValueHeaders: {},
        body: response.body,
        headers: {
          'Content-Type': 'application/json',
        },
      });
      expect(JSON.parse(response.body)).toEqual({
        invoices: [
          {
            id: 'inv-003',
            department: 'Crestone',
          },
        ],
        lastItem: null,
      });

      expect(ScanCommand).toHaveBeenCalledWith({
        TableName: 'TABLE_INVOICE_VAL',
        Limit: 50,
        ExclusiveStartKey: undefined,
        FilterExpression: '#department IN (:dept0, :dept1) AND #endDate < :beforeDate AND #startDate > :afterDate',
        ExpressionAttributeNames: {
          '#department': 'department',
          '#endDate': 'endDate',
          '#startDate': 'startDate',
        },
        ExpressionAttributeValues: {
          ':dept0': 'Baca',
          ':dept1': 'Crestone',
          ':beforeDate': '2026-05-01',
          ':afterDate': '2026-01-01',
        },
      });
    });

    testUserAuth({
      method: 'GET',
      path: '',
    }, main, true);
  });
});
