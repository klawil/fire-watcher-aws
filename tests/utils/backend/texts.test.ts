import {
  describe, expect, it, vi
} from 'vitest';

import { PutMetricDataCommand } from '../../../__mocks__/@aws-sdk/client-cloudwatch';
import {
  DynamoDBDocumentClientMock, ScanCommand,
  UpdateCommand
} from '../../../__mocks__/@aws-sdk/lib-dynamodb';
import { createFn } from '../../../__mocks__/twilio';

import * as mod from '@/utils/backend/texts';

describe('utils/backend/texts', () => {
  describe('getUserRecipients', () => {
    it('Adds the test user if test mode is enabled', async () => {
      DynamoDBDocumentClientMock.setResult('scan', {
        Items: [],
      });

      const out = await mod.getUserRecipients('all', null, true);

      expect(out).toEqual([ {
        phone: 5555555555,
      }, ]);
      expect(ScanCommand).toBeCalledTimes(1);
      expect(ScanCommand).toBeCalledWith({
        TableName: 'TABLE_USER_VAL',
        ExpressionAttributeNames: {
          '#isTest': 'isTest',
        },
        ExpressionAttributeValues: {
          ':isTest': true,
        },
        FilterExpression: '#isTest = :isTest',
      });
    });

    it('Scans for users that get a certain page talkgroup', async () => {
      DynamoDBDocumentClientMock.setResult('scan', {
        Items: [ {
          phone: 5555555555,
        }, ],
      });

      const out = await mod.getUserRecipients('all', 8332);

      expect(out).toEqual([ {
        phone: 5555555555,
      }, ]);
      expect(ScanCommand).toBeCalledTimes(1);
      expect(ScanCommand).toBeCalledWith({
        TableName: 'TABLE_USER_VAL',
        ExpressionAttributeNames: {
          '#talkgroups': 'talkgroups',
        },
        ExpressionAttributeValues: {
          ':talkgroup': 8332,
        },
        FilterExpression: 'contains(#talkgroups, :talkgroup)',
      });
    });

    it('Scans for users that are in a certain department', async () => {
      DynamoDBDocumentClientMock.setResult('scan', {
        Items: [ {
          phone: 5555555555,
        }, ],
      });

      const out = await mod.getUserRecipients('Baca', null);

      expect(out).toEqual([ {
        phone: 5555555555,
      }, ]);
      expect(ScanCommand).toBeCalledTimes(1);
      expect(ScanCommand).toBeCalledWith({
        TableName: 'TABLE_USER_VAL',
        ExpressionAttributeNames: {
          '#Baca': 'Baca',
          '#active': 'active',
        },
        ExpressionAttributeValues: {
          ':active': true,
        },
        FilterExpression: '#Baca.#active = :active',
      });
    });

    it('Scans for users that are in a certain department and receive a certain page tg', async () => {
      DynamoDBDocumentClientMock.setResult('scan', {
        Items: [ {
          phone: 5555555555,
        }, ],
      });

      const out = await mod.getUserRecipients('Baca', 8332);

      expect(out).toEqual([ {
        phone: 5555555555,
      }, ]);
      expect(ScanCommand).toBeCalledTimes(1);
      expect(ScanCommand).toBeCalledWith({
        TableName: 'TABLE_USER_VAL',
        ExpressionAttributeNames: {
          '#Baca': 'Baca',
          '#active': 'active',
          '#talkgroups': 'talkgroups',
        },
        ExpressionAttributeValues: {
          ':active': true,
          ':talkgroup': 8332,
        },
        FilterExpression: 'contains(#talkgroups, :talkgroup) AND #Baca.#active = :active',
      });
    });

    it('Scans for users that are in a certain department and receive a certain page tg and have testing enabled', async () => {
      DynamoDBDocumentClientMock.setResult('scan', {
        Items: [ {
          phone: 5555555555,
        }, ],
      });

      const out = await mod.getUserRecipients('Baca', 8332, true);

      expect(out).toEqual([ {
        phone: 5555555555,
      }, ]);
      expect(ScanCommand).toBeCalledTimes(1);
      expect(ScanCommand).toBeCalledWith({
        TableName: 'TABLE_USER_VAL',
        ExpressionAttributeNames: {
          '#Baca': 'Baca',
          '#active': 'active',
          '#talkgroups': 'talkgroups',
          '#isTest': 'isTest',
        },
        ExpressionAttributeValues: {
          ':active': true,
          ':talkgroup': 8332,
          ':isTest': true,
        },
        FilterExpression: 'contains(#talkgroups, :talkgroup) AND #Baca.#active = :active AND #isTest = :isTest',
      });
    });

    it('Scans for all users if no parameters are provided', async () => {
      DynamoDBDocumentClientMock.setResult('scan', {
        Items: [ {
          phone: 5555555555,
        }, ],
      });

      const out = await mod.getUserRecipients('all', null);

      expect(out).toEqual([ {
        phone: 5555555555,
      }, ]);
      expect(ScanCommand).toBeCalledTimes(1);
      expect(ScanCommand).toBeCalledWith({
        TableName: 'TABLE_USER_VAL',
      });
    });
  });

  describe('saveMessageData', () => {
    it('Saves the minimum data when provided', async () => {
      await mod.saveMessageData(
        'account',
        12345,
        10,
        'test-body'
      );

      expect(UpdateCommand).toBeCalledTimes(1);
      expect(UpdateCommand).toBeCalledWith({
        TableName: 'TABLE_TEXT_VAL',
        ExpressionAttributeNames: {
          '#body': 'body',
          '#isPage': 'isPage',
          '#isTest': 'isTest',
          '#recipients': 'recipients',
          '#testPageIndex': 'testPageIndex',
          '#type': 'type',
        },
        ExpressionAttributeValues: {
          ':body': 'test-body',
          ':isPage': false,
          ':isTest': false,
          ':recipients': 10,
          ':testPageIndex': 'nn',
          ':type': 'account',
        },
        Key: {
          datetime: 12345,
        },
        UpdateExpression: 'SET #recipients = :recipients, #body = :body, #isPage = :isPage, #isTest = :isTest, #testPageIndex = :testPageIndex, #type = :type',
      });
    });

    it('Saves the maximum data when provided', async () => {
      await mod.saveMessageData(
        'account',
        12345,
        10,
        'test-body',
        [
          'test-media-1',
          'test-media-2',
        ],
        'test-page-id',
        8332,
        'Baca',
        true
      );

      expect(UpdateCommand).toBeCalledTimes(1);
      expect(UpdateCommand).toBeCalledWith({
        TableName: 'TABLE_TEXT_VAL',
        ExpressionAttributeNames: {
          '#body': 'body',
          '#isPage': 'isPage',
          '#isTest': 'isTest',
          '#recipients': 'recipients',
          '#testPageIndex': 'testPageIndex',
          '#type': 'type',
          '#department': 'department',
          '#talkgroup': 'talkgroup',
          '#pageId': 'pageId',
          '#mediaUrls': 'mediaUrls',
        },
        ExpressionAttributeValues: {
          ':body': 'test-body',
          ':isPage': true,
          ':isTest': true,
          ':recipients': 10,
          ':testPageIndex': 'yy',
          ':type': 'account',
          ':department': 'Baca',
          ':talkgroup': 8332,
          ':pageId': 'test-page-id',
          ':mediaUrls': [
            'test-media-1',
            'test-media-2',
          ],
        },
        Key: {
          datetime: 12345,
        },
        UpdateExpression: 'SET #recipients = :recipients, #body = :body, #isPage = :isPage, #isTest = :isTest, #testPageIndex = :testPageIndex, #type = :type, #department = :department, #talkgroup = :talkgroup, #pageId = :pageId, #mediaUrls = :mediaUrls',
      });
    });

    it('Sends a metric to cloudwatch to track the number of recipients', async () => {
      await mod.saveMessageData(
        'account',
        12345,
        10,
        'test-body'
      );

      expect(PutMetricDataCommand).toBeCalledWith({
        Namespace: 'Twilio Health',
        MetricData: [ {
          MetricName: 'Initiated',
          Timestamp: new Date(12345),
          Unit: 'Count',
          Value: 10,
        }, ],
      });
    });
  });

  describe('sendMessage', () => {
    it('Sends a text to the appropriate user', async () => {
      await mod.sendMessage(
        'account',
        12345,
        5555555555,
        'alert',
        'test-body'
      );

      expect(createFn).toBeCalledWith({
        body: 'test-body',
        mediaUrl: [],
        from: '+12222222222',
        to: '+15555555555',
        statusCallback: 'https://cofrn.org/api/v2/twilio/12345/',
      });
    });

    it('Saves message data if no ID is provided', async () => {
      vi.useFakeTimers().setSystemTime(123456);

      await mod.sendMessage(
        'account',
        null,
        5555555555,
        'alert',
        'test-body'
      );

      expect(createFn).toBeCalledWith({
        body: 'test-body',
        mediaUrl: [],
        from: '+12222222222',
        to: '+15555555555',
        statusCallback: 'https://cofrn.org/api/v2/twilio/123456/',
      });
      expect(UpdateCommand).toBeCalledWith({
        TableName: 'TABLE_TEXT_VAL',
        ExpressionAttributeNames: {
          '#body': 'body',
          '#isPage': 'isPage',
          '#isTest': 'isTest',
          '#recipients': 'recipients',
          '#testPageIndex': 'testPageIndex',
          '#type': 'type',
        },
        ExpressionAttributeValues: {
          ':body': 'test-body',
          ':isPage': false,
          ':isTest': false,
          ':recipients': 1,
          ':testPageIndex': 'nn',
          ':type': 'account',
        },
        Key: {
          datetime: 123456,
        },
        UpdateExpression: 'SET #recipients = :recipients, #body = :body, #isPage = :isPage, #isTest = :isTest, #testPageIndex = :testPageIndex, #type = :type',
      });
    });

    it('Throws an error if an invalid phone number type is provided', async () => {
      await expect(async () => mod.sendMessage(
        'account',
        null,
        5555555555,
        'alertTest' as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        'test-body'
      )).rejects.toThrow();
    });
  });

  describe('sendAlertMessage', () => {
    it('Sends a message to all the users that get the alerts', async () => {
      DynamoDBDocumentClientMock.setResult('scan', {
        Items: [
          {
            phone: 5555555555,
            getApiAlerts: true,
          },
          {
            phone: 4444444444,
            getApiAlerts: true,
          },
          {
            phone: 3333333333,
          },
        ],
      });

      await mod.sendAlertMessage('Api', 'test-body');

      expect(createFn).toBeCalledTimes(2);
      expect(createFn).toBeCalledWith({
        body: 'test-body',
        mediaUrl: [],
        from: '+12222222222',
        to: '+15555555555',
        statusCallback: 'https://cofrn.org/api/v2/twilio/123456/',
      });
      expect(createFn).toBeCalledWith({
        body: 'test-body',
        mediaUrl: [],
        from: '+12222222222',
        to: '+14444444444',
        statusCallback: 'https://cofrn.org/api/v2/twilio/123456/',
      });
    });

    it('Saves the message data', async () => {
      DynamoDBDocumentClientMock.setResult('scan', {
        Items: [
          {
            phone: 5555555555,
            getApiAlerts: true,
          },
          {
            phone: 4444444444,
            getApiAlerts: true,
          },
          {
            phone: 3333333333,
          },
        ],
      });

      await mod.sendAlertMessage('Api', 'test-body');

      expect(UpdateCommand).toBeCalledWith({
        TableName: 'TABLE_TEXT_VAL',
        ExpressionAttributeNames: {
          '#body': 'body',
          '#isPage': 'isPage',
          '#isTest': 'isTest',
          '#recipients': 'recipients',
          '#testPageIndex': 'testPageIndex',
          '#type': 'type',
        },
        ExpressionAttributeValues: {
          ':body': 'test-body',
          ':isPage': false,
          ':isTest': false,
          ':recipients': 2,
          ':testPageIndex': 'nn',
          ':type': 'alert',
        },
        Key: {
          datetime: 123456,
        },
        UpdateExpression: 'SET #recipients = :recipients, #body = :body, #isPage = :isPage, #isTest = :isTest, #testPageIndex = :testPageIndex, #type = :type',
      });
    });
  });

  describe('getPageNumber', () => {
    it('Returns the page number from the users only department', async () => {
      expect(await mod.getPageNumber({
        phone: 5555555555,
        Baca: {
          active: true,
        },
      })).toEqual('pageBaca');
    });

    it('Returns the default number if no departments are available', async () => {
      expect(await mod.getPageNumber({
        phone: 5555555555,
      })).toEqual('page');
    });

    it('Returns the default number if multiple departments are available with no pagingPhone', async () => {
      expect(await mod.getPageNumber({
        phone: 5555555555,
        Baca: {
          active: true,
        },
        NSCAD: {
          active: true,
        },
      })).toEqual('page');
    });

    it('Returns the default number if multiple departments are available with a pagingPhone that doesn\'t match the user', async () => {
      expect(await mod.getPageNumber({
        phone: 5555555555,
        Baca: {
          active: true,
        },
        NSCAD: {
          active: true,
        },
        pagingPhone: 'Crestone',
      })).toEqual('page');
    });

    it('Returns the pagingPhone number if multiple departments are available with a pagingPhone', async () => {
      expect(await mod.getPageNumber({
        phone: 5555555555,
        Baca: {
          active: true,
        },
        NSCAD: {
          active: true,
        },
        pagingPhone: 'NSCAD',
      })).toEqual('pageNSCAD');
    });
  });
});
