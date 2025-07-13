import { APIGatewayProxyEvent } from 'aws-lambda';
import {
  beforeEach,
  describe, expect, it, vi
} from 'vitest';

import { PutMetricDataCommand } from '../../../../__mocks__/@aws-sdk/client-cloudwatch';
import { SendMessageCommand } from '../../../../__mocks__/@aws-sdk/client-sqs';
import {
  DynamoDBDocumentClientMock, GetCommand,
  UpdateCommand
} from '../../../../__mocks__/@aws-sdk/lib-dynamodb';
import { validateRequest } from '../../../../__mocks__/twilio';

import { generateApiEvent } from './_utils';

import { main } from '@/resources/api/v2/twilioStatus';

describe('resources/api/v2/twilioStatus', () => {
  describe('POST', () => {
    let req: APIGatewayProxyEvent;
    beforeEach(() => {
      req = generateApiEvent({
        method: 'POST',
        path: '',
        body: 'MessageStatus=delivered&To=%2B15555555555&From=%2B14444444444',
        pathParameters: {
          id: '1234567890123',
        },
        headers: {
          'X-Twilio-Signature': 'TwilioSignature',
          'X-Forwarded-Proto': 'https',
          'X-Forwarded-Host': 'test.com',
        },
      });
    });

    it('Returns a 400 error if there are no parameters', async () => {
      req.pathParameters = {};

      expect(await main(req)).toEqual({
        body: JSON.stringify({
          message: 'Invalid request body',
          errors: [ 'id', ],
        }),
        statusCode: 400,
        multiValueHeaders: {},
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('Returns a 400 error if the id parameter is not a number', async () => {
      req.pathParameters = {
        id: 'test',
      };

      expect(await main(req)).toEqual({
        body: JSON.stringify({
          message: 'Invalid request body',
          errors: [ 'id', ],
        }),
        statusCode: 400,
        multiValueHeaders: {},
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('Returns a 400 error if there is an error in the body (missing)', async () => {
      req.body = 'To=%2B15555555555&From=%2B14444444444';

      expect(await main(req)).toEqual({
        body: JSON.stringify({
          message: 'Invalid request body',
          errors: [ 'MessageStatus', ],
        }),
        statusCode: 400,
        multiValueHeaders: {},
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('Returns a 400 error if there is an error in the body (malformed)', async () => {
      req.body = 'MessageStatus=none&To=5555555555&From=14444444444';

      expect(await main(req)).toEqual({
        body: JSON.stringify({
          message: 'Invalid request body',
          errors: [
            'To',
            'From',
            'MessageStatus',
          ],
        }),
        statusCode: 400,
        multiValueHeaders: {},
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('Returns a 400 error if the From number is not in our config', async () => {
      req.body = 'MessageStatus=delivered&To=%2B15555555555&From=%2B11234567890';

      expect(await main(req)).toEqual({
        body: JSON.stringify({
          message: 'Invalid request body',
          errors: [ 'From', ],
        }),
        statusCode: 400,
        multiValueHeaders: {},
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('Returns a 400 error if the message cannot be authenticated', async () => {
      req.body = 'MessageStatus=delivered&To=%2B15555555555&From=%2B14444444444';

      validateRequest.mockReturnValue(false);

      expect(await main(req)).toEqual({
        body: JSON.stringify({
          message: 'Invalid request body',
          errors: [],
        }),
        statusCode: 400,
        multiValueHeaders: {},
        headers: {
          'Content-Type': 'application/json',
        },
      });
    });

    it('Returns a 204 if the To number is not a user', async () => {
      req.body = 'MessageStatus=delivered&To=%2B15555555555&From=%2B14444444444';

      validateRequest.mockReturnValue(true);

      expect(await main(req)).toEqual({
        body: '',
        statusCode: 204,
        multiValueHeaders: {},
      });

      expect(validateRequest).toHaveBeenCalledTimes(1);
      expect(GetCommand).toHaveBeenCalledTimes(1);
    });

    it('Returns a 204 if the status is successfully parsed', async () => {
      vi.useFakeTimers().setSystemTime(12345);

      req.body = 'MessageStatus=delivered&To=%2B15555555555&From=%2B14444444444';

      validateRequest.mockReturnValue(true);
      DynamoDBDocumentClientMock.setResult('get', {
        Item: {
          phone: 5555555555,
        },
      });

      expect(await main(req)).toEqual({
        body: '',
        statusCode: 204,
        multiValueHeaders: {},
      });

      // Validate the Twilio request
      expect(validateRequest).toHaveBeenCalledTimes(1);

      // Get the user to verify they are a user
      expect(GetCommand).toHaveBeenCalledTimes(1);
      expect(GetCommand).toHaveBeenCalledWith({
        TableName: 'TABLE_USER_VAL',
        Key: {
          phone: 5555555555,
        },
      });

      // Send the status into the queue for processing
      expect(SendMessageCommand).toHaveBeenCalledTimes(1);
      expect(SendMessageCommand).toHaveBeenCalledWith({
        QueueUrl: 'TWILIO_QUEUE_VAL',
        MessageBody: JSON.stringify({
          datetime: 1234567890123,
          status: 'delivered',
          phone: 5555555555,
          eventTime: 12345,
        }),
      });

      // Update the user with the most recent status
      expect(UpdateCommand).toHaveBeenCalledTimes(1);
      expect(UpdateCommand).toHaveBeenCalledWith({
        TableName: 'TABLE_USER_VAL',
        Key: {
          phone: 5555555555,
        },
        ExpressionAttributeNames: {
          '#lastStatus': 'lastStatus',
          '#lastStatusCount': 'lastStatusCount',
        },
        ExpressionAttributeValues: {
          ':lastStatus': 'delivered',
          ':lastStatusBase': 0,
        },
        UpdateExpression: 'SET #lastStatus = :lastStatus, #lastStatusCount = :lastStatusBase',
        ReturnValues: 'ALL_NEW',
      });

      // Add the metrics for text timing
      expect(PutMetricDataCommand).toHaveBeenCalledTimes(1);
      expect(PutMetricDataCommand).toHaveBeenCalledWith({
        Namespace: 'Twilio Health',
        MetricData: [ {
          MetricName: 'DeliveredTime',
          Timestamp: new Date(1234567890123),
          Unit: 'Milliseconds',
          Value: 12345 - 1234567890123,
        }, ],
      });
    });

    it('Sends a message to the queue if the user has enough undelivered messages', async () => {
      vi.useFakeTimers().setSystemTime(12345);

      req.body = 'MessageStatus=undelivered&To=%2B15555555555&From=%2B14444444444';

      validateRequest.mockReturnValue(true);
      DynamoDBDocumentClientMock.setResult('get', {
        Item: {
          phone: 5555555555,
        },
      });
      DynamoDBDocumentClientMock.setResult('update', {
        Attributes: {
          phone: 5555555555,
          lastStatus: 'undelivered',
          lastStatusCount: 10,
          fName: 'TestF',
          lName: 'TestL',
          Baca: {
            active: true,
          },
        },
      });

      expect(await main(req)).toEqual({
        body: '',
        statusCode: 204,
        multiValueHeaders: {},
      });

      // Update the user with the most recent status
      expect(UpdateCommand).toHaveBeenCalledTimes(1);
      expect(UpdateCommand).toHaveBeenCalledWith({
        TableName: 'TABLE_USER_VAL',
        Key: {
          phone: 5555555555,
        },
        ExpressionAttributeNames: {
          '#lastStatus': 'lastStatus',
          '#lastStatusCount': 'lastStatusCount',
        },
        ExpressionAttributeValues: {
          ':lastStatus': 'undelivered',
          ':lastStatusBase': 0,
          ':lastStatusIncrement': 1,
        },
        UpdateExpression: 'SET #lastStatus = :lastStatus, #lastStatusCount = if_not_exists(#lastStatusCount, :lastStatusBase) + :lastStatusIncrement',
        ReturnValues: 'ALL_NEW',
      });

      // Send the message into the queue
      expect(SendMessageCommand).toHaveBeenCalledTimes(2);
      expect(SendMessageCommand).toHaveBeenCalledWith({
        QueueUrl: 'TWILIO_QUEUE_VAL',
        MessageBody: JSON.stringify({
          datetime: 1234567890123,
          status: 'undelivered',
          phone: 5555555555,
          eventTime: 12345,
        }),
      });
      expect(SendMessageCommand).toHaveBeenCalledWith({
        QueueUrl: 'SQS_QUEUE_VAL',
        MessageBody: JSON.stringify({
          action: 'phone-issue',
          count: 10,
          name: 'TestF TestL',
          number: 5555555555,
          department: [ 'Baca', ],
        }),
      });
    });

    it('Does not update the user if the status is not delivered or undelivered', async () => {
      vi.useFakeTimers().setSystemTime(12345);

      req.body = 'MessageStatus=sent&To=%2B15555555555&From=%2B14444444444';

      validateRequest.mockReturnValue(true);
      DynamoDBDocumentClientMock.setResult('get', {
        Item: {
          phone: 5555555555,
        },
      });

      expect(await main(req)).toEqual({
        body: '',
        statusCode: 204,
        multiValueHeaders: {},
      });

      // Validate the Twilio request
      expect(validateRequest).toHaveBeenCalledTimes(1);

      // Get the user to verify they are a user
      expect(GetCommand).toHaveBeenCalledTimes(1);
      expect(GetCommand).toHaveBeenCalledWith({
        TableName: 'TABLE_USER_VAL',
        Key: {
          phone: 5555555555,
        },
      });

      // Send the status into the queue for processing
      expect(SendMessageCommand).toHaveBeenCalledTimes(1);
      expect(SendMessageCommand).toHaveBeenCalledWith({
        QueueUrl: 'TWILIO_QUEUE_VAL',
        MessageBody: JSON.stringify({
          datetime: 1234567890123,
          status: 'sent',
          phone: 5555555555,
          eventTime: 12345,
        }),
      });

      // Update the user with the most recent status
      expect(UpdateCommand).toHaveBeenCalledTimes(0);

      // Add the metrics for text timing
      expect(PutMetricDataCommand).toHaveBeenCalledTimes(1);
      expect(PutMetricDataCommand).toHaveBeenCalledWith({
        Namespace: 'Twilio Health',
        MetricData: [ {
          MetricName: 'SentTime',
          Timestamp: new Date(1234567890123),
          Unit: 'Milliseconds',
          Value: 12345 - 1234567890123,
        }, ],
      });
    });
  });
});
