import { APIGatewayProxyEvent } from 'aws-lambda';
import {
  beforeEach,
  describe, expect, it
} from 'vitest';

import { SendMessageCommand } from '../../../../__mocks__/@aws-sdk/client-sqs';
import {
  DynamoDBDocumentClientMock, GetCommand,
  UpdateCommand
} from '../../../../__mocks__/@aws-sdk/lib-dynamodb';
import { validateRequest } from '../../../../__mocks__/twilio';
import { twilioConf } from '../../../../__mocks__/twilioConfig';

import { generateApiEvent } from './_utils';

import { main } from '@/resources/api/v2/twilioBase';
import { CreateTextApi } from '@/types/api/twilio';

describe('resources/api/v2/twilioBase', () => {
  describe('POST', () => {
    let req: APIGatewayProxyEvent;
    let bodyObj: CreateTextApi['body'];
    beforeEach(() => {
      // The Lambda event to spoof
      req = generateApiEvent({
        method: 'POST',
        path: '',
        body: `To=${encodeURIComponent(twilioConf.phoneNumberBacapage as string)}&From=%2B15555555555` +
          '&Body=Test+Message&NumMedia=0&NumSegments=1',
        headers: {
          'X-Twilio-Signature': 'TwilioSignature',
          'X-Forwarded-Proto': 'https',
          'X-Forwarded-Host': 'test.com',
        },
      });
      bodyObj = {
        From: '+15555555555',
        To: twilioConf.phoneNumberBacapage as string,
        Body: 'Test Message',
        NumMedia: 0,
        NumSegments: 1,
      };

      // Set Twilio to come back as valid
      validateRequest.mockReturnValue(true);

      // The user comes back as a real user who is an admin on the department
      DynamoDBDocumentClientMock.setResult('get', {
        Item: {
          phone: 5555555555,
          Baca: {
            admin: true,
            active: true,
          },
          fName: 'TestF',
          lName: 'TestL',
        },
      });
    });

    it('Sends the message into the queue if all checks pass', async () => {
      expect(await main(req)).toEqual({
        statusCode: 200,
        body: '<Response></Response>',
        headers: {
          'Content-Type': 'application/xml',
        },
      });

      // Twilio validated
      expect(validateRequest).toHaveBeenCalledTimes(1);
      expect(validateRequest).toHaveBeenCalledWith(
        'authTokenBaca',
        'TwilioSignature',
        'https://test.com',
        {
          ...bodyObj,
          NumMedia: '0',
          NumSegments: '1',
        }
      );

      // Sender validated
      expect(GetCommand).toHaveBeenCalledTimes(1);
      expect(GetCommand).toHaveBeenCalledWith({
        TableName: 'TABLE_USER_VAL',
        Key: {
          phone: 5555555555,
        },
      });

      // Message sent to the queue
      expect(SendMessageCommand).toHaveBeenCalledTimes(1);
      expect(SendMessageCommand).toHaveBeenCalledWith({
        QueueUrl: 'SQS_QUEUE_VAL',
        MessageBody: JSON.stringify({
          action: 'twilio-text',
          body: bodyObj,
          user: {
            phone: 5555555555,
            Baca: {
              admin: true,
              active: true,
            },
            fName: 'TestF',
            lName: 'TestL',
            isTest: false,
          },
        }),
      });
    });

    it('Returns a 400 error if the body is malformed', async () => {
      req.body = '';

      expect(await main(req)).toEqual({
        statusCode: 400,
        body: '<Response><Message>There was an issue processing your request</Message></Response>',
        headers: {
          'Content-Type': 'application/xml',
        },
      });

      expect(validateRequest).toHaveBeenCalledTimes(0);
      expect(GetCommand).toHaveBeenCalledTimes(0);
      expect(SendMessageCommand).toHaveBeenCalledTimes(0);
    });

    it('Returns an empty 200 response if the To number is not recognized', async () => {
      req.body = req.body?.replace(/To=[^\&]+\&/, 'To=%2B11234567890&') || null;

      expect(await main(req)).toEqual({
        statusCode: 200,
        body: '<Response></Response>',
        headers: {
          'Content-Type': 'application/xml',
        },
      });

      expect(validateRequest).toHaveBeenCalledTimes(0);
      expect(GetCommand).toHaveBeenCalledTimes(0);
      expect(SendMessageCommand).toHaveBeenCalledTimes(0);
    });

    it('Returns an empty 200 response if the request is not authenticated', async () => {
      validateRequest.mockReturnValue(false);

      expect(await main(req)).toEqual({
        statusCode: 200,
        body: '<Response></Response>',
        headers: {
          'Content-Type': 'application/xml',
        },
      });

      expect(validateRequest).toHaveBeenCalledTimes(1);
      expect(GetCommand).toHaveBeenCalledTimes(0);
      expect(SendMessageCommand).toHaveBeenCalledTimes(0);
    });

    it('Returns an empty 200 response if the user is not recognized', async () => {
      DynamoDBDocumentClientMock.setResult('get', {});

      expect(await main(req)).toEqual({
        statusCode: 200,
        body: '<Response></Response>',
        headers: {
          'Content-Type': 'application/xml',
        },
      });

      expect(validateRequest).toHaveBeenCalledTimes(1);
      expect(GetCommand).toHaveBeenCalledTimes(1);
      expect(SendMessageCommand).toHaveBeenCalledTimes(0);
    });

    it('Returns a text response if a non-admin texts a paging number with no chat group', async () => {
      DynamoDBDocumentClientMock.setResult('get', {
        Item: {
          phone: 5555555555,
          Baca: {
            active: true,
          },
          fName: 'TestF',
          lName: 'TestL',
        },
      });

      expect(await main(req)).toEqual({
        statusCode: 200,
        body: '<Response><Message>This department is not using the group text feature of this system</Message></Response>',
        headers: {
          'Content-Type': 'application/xml',
        },
      });

      expect(validateRequest).toHaveBeenCalledTimes(1);
      expect(GetCommand).toHaveBeenCalledTimes(1);
      expect(SendMessageCommand).toHaveBeenCalledTimes(0);
    });

    it('Returns a text response if the text is sent to the alert number', async () => {
      req.body = req.body?.replace(/To=[^\&]+\&/, `To=${encodeURIComponent(twilioConf.phoneNumberalert as string)}&`) ||
        null;

      expect(await main(req)).toEqual({
        statusCode: 200,
        body: '<Response><Message>This number is not able to receive messages</Message></Response>',
        headers: {
          'Content-Type': 'application/xml',
        },
      });

      expect(validateRequest).toHaveBeenCalledTimes(1);
      expect(GetCommand).toHaveBeenCalledTimes(1);
      expect(SendMessageCommand).toHaveBeenCalledTimes(0);
    });

    it('Returns a text response if the user is not a department member', async () => {
      req.body = req.body?.replace(/To=[^\&]+\&/, `To=${encodeURIComponent(twilioConf.phoneNumberNSCADchat as string)}&`) ||
        null;

      expect(await main(req)).toEqual({
        statusCode: 200,
        body: '<Response><Message>You are not an active member of the NSCAD department</Message></Response>',
        headers: {
          'Content-Type': 'application/xml',
        },
      });

      expect(validateRequest).toHaveBeenCalledTimes(1);
      expect(GetCommand).toHaveBeenCalledTimes(1);
      expect(SendMessageCommand).toHaveBeenCalledTimes(0);
    });

    it('Returns the text command response if a text command is sent', async () => {
      req.body = req.body?.replace(/Body=[^\&]+\&/, 'Body=!startTest&') || null;

      expect(await main(req)).toEqual({
        statusCode: 200,
        body: '<Response><Message>Testing mode enabled</Message></Response>',
        headers: {
          'Content-Type': 'application/xml',
        },
      });

      // Twilio validated
      expect(validateRequest).toHaveBeenCalledTimes(1);
      expect(validateRequest).toHaveBeenCalledWith(
        'authTokenBaca',
        'TwilioSignature',
        'https://test.com',
        {
          ...bodyObj,
          NumMedia: '0',
          NumSegments: '1',
          Body: '!startTest',
        }
      );

      // Sender validated
      expect(GetCommand).toHaveBeenCalledTimes(1);
      expect(GetCommand).toHaveBeenCalledWith({
        TableName: 'TABLE_USER_VAL',
        Key: {
          phone: 5555555555,
        },
      });

      // User updated
      expect(UpdateCommand).toHaveBeenCalledTimes(1);
      expect(UpdateCommand).toHaveBeenCalledWith({
        TableName: 'TABLE_USER_VAL',
        Key: {
          phone: 5555555555,
        },
        ExpressionAttributeNames: {
          '#isTest': 'isTest',
        },
        ExpressionAttributeValues: {
          ':isTest': true,
        },
        UpdateExpression: 'SET #isTest = :isTest',
      });

      // Message not sent to the queue
      expect(SendMessageCommand).toHaveBeenCalledTimes(0);
    });

    it('Returns a text response if a non-text command that starts with ! is sent', async () => {
      req.body = req.body?.replace(/Body=[^\&]+\&/, 'Body=!not+Test&') || null;

      expect(await main(req)).toEqual({
        statusCode: 200,
        body: '<Response><Message>Messages that begin with an exclamation mark are reserved for testing purposes</Message></Response>',
        headers: {
          'Content-Type': 'application/xml',
        },
      });

      // Twilio validated
      expect(validateRequest).toHaveBeenCalledTimes(1);
      expect(validateRequest).toHaveBeenCalledWith(
        'authTokenBaca',
        'TwilioSignature',
        'https://test.com',
        {
          ...bodyObj,
          NumMedia: '0',
          NumSegments: '1',
          Body: '!not Test',
        }
      );

      // Sender validated
      expect(GetCommand).toHaveBeenCalledTimes(1);
      expect(GetCommand).toHaveBeenCalledWith({
        TableName: 'TABLE_USER_VAL',
        Key: {
          phone: 5555555555,
        },
      });

      // User not updated
      expect(UpdateCommand).toHaveBeenCalledTimes(0);

      // Message not sent to the queue
      expect(SendMessageCommand).toHaveBeenCalledTimes(0);
    });
  });
});
