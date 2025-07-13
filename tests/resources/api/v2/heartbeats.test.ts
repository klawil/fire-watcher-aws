import {
  describe, expect, it, vi
} from 'vitest';

import { PutMetricDataCommand } from '../../../../__mocks__/@aws-sdk/client-cloudwatch';
import {
  DynamoDBDocumentClientMock,
  ScanCommand, UpdateCommand
} from '../../../../__mocks__/@aws-sdk/lib-dynamodb';

import {
  generateApiEvent, mockUserRequest, testUserAuth
} from './_utils';

import { main } from '@/resources/api/v2/heartbeats';

describe('resources/api/v2/heartbeats', () => {
  describe('POST', () => {
    it('Saves the correct information when a heartbeat is received', async () => {
      const req = generateApiEvent({
        method: 'POST',
        path: '',
        body: JSON.stringify({
          Server: 'test',
          IsPrimary: true,
          IsActive: true,
        }),
      });

      vi.useFakeTimers().setSystemTime(123456);

      expect(await main(req)).toEqual({
        statusCode: 200,
        multiValueHeaders: {},
        body: '[]',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Cloudwatch metric
      expect(PutMetricDataCommand).toHaveBeenCalledTimes(1);
      expect(PutMetricDataCommand).toHaveBeenCalledWith({
        Namespace: 'VHF Metrics',
        MetricData: [ {
          MetricName: 'test',
          Timestamp: new Date(),
          Unit: 'Count',
          Value: 1,
        }, ],
      });

      // Heartbeat table update
      expect(UpdateCommand).toHaveBeenCalledTimes(1);
      expect(UpdateCommand).toHaveBeenCalledWith({
        TableName: 'TABLE_STATUS_VAL',
        Key: {
          Server: 'test',
        },
        ExpressionAttributeNames: {
          '#IsPrimary': 'IsPrimary',
          '#IsActive': 'IsActive',
          '#LastHeartbeat': 'LastHeartbeat',
        },
        ExpressionAttributeValues: {
          ':IsPrimary': true,
          ':IsActive': true,
          ':LastHeartbeat': Date.now(),
        },
        UpdateExpression: 'SET #IsPrimary = :IsPrimary, #IsActive = :IsActive, #LastHeartbeat = :LastHeartbeat',
      });

      // Scan for other heartbeats
      expect(ScanCommand).toHaveBeenCalledTimes(1);
      expect(ScanCommand).toHaveBeenCalledWith({
        TableName: 'TABLE_STATUS_VAL',
      });
    });

    it('Returns the other servers status', async () => {
      const req = generateApiEvent({
        method: 'POST',
        path: '',
        body: JSON.stringify({
          Server: 'test',
          IsPrimary: true,
          IsActive: true,
        }),
      });

      vi.useFakeTimers().setSystemTime(123456);

      DynamoDBDocumentClientMock.setResult('scan', {
        Items: [
          {
            Server: 'test',
            IsPrimary: true,
            IsActive: true,
            LastHeartbeat: 123456,
          },
          {
            Server: 'other',
            IsPrimary: false,
            IsActive: true,
            LastHeartbeat: 123455,
          },
        ],
      });

      expect(await main(req)).toEqual({
        statusCode: 200,
        multiValueHeaders: {},
        body: JSON.stringify([
          {
            Server: 'test',
            IsPrimary: true,
            IsActive: true,
            LastHeartbeat: 123456,
          },
          {
            Server: 'other',
            IsPrimary: false,
            IsActive: true,
            LastHeartbeat: 123455,
          },
        ]),
        headers: {
          'Content-Type': 'application/json',
        },
      });

      // Cloudwatch metric
      expect(PutMetricDataCommand).toHaveBeenCalledTimes(1);
      expect(PutMetricDataCommand).toHaveBeenCalledWith({
        Namespace: 'VHF Metrics',
        MetricData: [ {
          MetricName: 'test',
          Timestamp: new Date(),
          Unit: 'Count',
          Value: 1,
        }, ],
      });

      // Heartbeat table update
      expect(UpdateCommand).toHaveBeenCalledTimes(1);
      expect(UpdateCommand).toHaveBeenCalledWith({
        TableName: 'TABLE_STATUS_VAL',
        Key: {
          Server: 'test',
        },
        ExpressionAttributeNames: {
          '#IsPrimary': 'IsPrimary',
          '#IsActive': 'IsActive',
          '#LastHeartbeat': 'LastHeartbeat',
        },
        ExpressionAttributeValues: {
          ':IsPrimary': true,
          ':IsActive': true,
          ':LastHeartbeat': Date.now(),
        },
        UpdateExpression: 'SET #IsPrimary = :IsPrimary, #IsActive = :IsActive, #LastHeartbeat = :LastHeartbeat',
      });

      // Scan for other heartbeats
      expect(ScanCommand).toHaveBeenCalledTimes(1);
      expect(ScanCommand).toHaveBeenCalledWith({
        TableName: 'TABLE_STATUS_VAL',
      });
    });

    it('Returns a 400 error if the body is malformed', async () => {
      const req = generateApiEvent({
        method: 'POST',
        path: '',
        body: JSON.stringify({
          Server: 1234,
          IsPrimary: 'y',
          IsActive: 'n',
          OtherKey: 'test',
        }),
      });

      expect(await main(req)).toEqual({
        statusCode: 400,
        multiValueHeaders: {},
        body: JSON.stringify({
          message: 'Invalid request body',
          errors: [
            'Server',
            'IsPrimary',
            'IsActive',
          ],
        }),
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });
  });

  describe('GET', () => {
    it('Returns the results of a scan of the status table', async () => {
      const req = generateApiEvent({
        method: 'GET',
        path: '',
      });
      mockUserRequest(req, true, true);

      DynamoDBDocumentClientMock.setResult('scan', {
        Items: [
          {
            Server: 'test',
            IsPrimary: true,
            IsActive: true,
            LastHeartbeat: 123456,
          },
          {
            Server: 'other',
            IsPrimary: false,
            IsActive: true,
            LastHeartbeat: 123455,
          },
        ],
      });

      expect(await main(req)).toEqual({
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
        },
        multiValueHeaders: {},
        body: JSON.stringify([
          {
            Server: 'test',
            IsPrimary: true,
            IsActive: true,
            LastHeartbeat: 123456,
          },
          {
            Server: 'other',
            IsPrimary: false,
            IsActive: true,
            LastHeartbeat: 123455,
          },
        ]),
      });
    });

    testUserAuth({
      method: 'GET',
      path: '',
    }, main, true);
  });
});
