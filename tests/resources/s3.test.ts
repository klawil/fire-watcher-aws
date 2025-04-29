import {
  describe, expect, it,
  jest
} from '@jest/globals';
import { S3EventRecord } from 'aws-lambda';

import { PutMetricDataCommand } from '../../__mocks__/@aws-sdk/client-cloudwatch';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  S3Mock
} from '../../__mocks__/@aws-sdk/client-s3';
import { SendMessageCommand } from '../../__mocks__/@aws-sdk/client-sqs';
import { StartTranscriptionJobCommand } from '../../__mocks__/@aws-sdk/client-transcribe';
import {
  DeleteCommand, DynamoDBDocumentClientMock,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand
} from '../../__mocks__/@aws-sdk/lib-dynamodb';

import * as mod from '@/resources/s3';

const newS3Event = (
  bucket: string,
  key: string,
  eventName: 'ObjectCreated' | 'ObjectDeleted'
): S3EventRecord => ({
  s3: {
    s3SchemaVersion: '',
    configurationId: '',
    bucket: {
      name: bucket,
      arn: '',
      ownerIdentity: { principalId: '', },
    },
    object: {
      key,
      size: 0,
      eTag: '',
      sequencer: '',
    },
  },
  eventName,
  eventVersion: '',
  eventSource: '',
  awsRegion: '',
  eventTime: '',
  userIdentity: { principalId: '', },
  requestParameters: { sourceIPAddress: '', },
  responseElements: {
    'x-amz-request-id': '',
    'x-amz-id-2': '',
  },
});

const createDtrEvent = newS3Event(
  'bucket-name',
  'audio/dtr/8332-1745367697_851475000.0-call_227155.m4a',
  'ObjectCreated'
);
const createDtrHeadInfo = {
  Metadata: {
    start_time: '10',
    stop_time: '15',
    call_length: '7',
    freq: '1234',
    emergency: '0',
    tone: 'false',
    source: 'tower',
    talkgroup_num: '1234',
  },
};
const createDtrPageHeadInfo = {
  Metadata: {
    start_time: '10',
    stop_time: '15',
    call_length: '7',
    freq: '1234',
    emergency: '0',
    tone: 'true',
    source: 'tower',
    talkgroup_num: '8198',
  },
};
const createDtrEmergencyHeadInfo = {
  Metadata: {
    start_time: '10',
    stop_time: '15',
    call_length: '7',
    freq: '1234',
    emergency: '1',
    tone: 'false',
    source: 'tower',
    talkgroup_num: '1234',
  },
};

const createVhfEvent = newS3Event(
  'bucket-name',
  'audio/BG_FIRE_VHF_20250422_003158.mp3',
  'ObjectCreated'
);
const createVhfHeadInfo = {
  Metadata: {
    datetime: '2000',
    len: '15',
    tone: 'n',
  },
};

describe('resources/s3', () => {
  describe('main', () => {
    it('Handles a DTR file being created', async () => {
      jest.useFakeTimers().setSystemTime(123456);

      S3Mock.setResult('head', createDtrHeadInfo);

      await mod.main({
        Records: [ createDtrEvent, ],
      });

      // Call to get the S3 information
      expect(HeadObjectCommand).toBeCalledTimes(1);
      expect(HeadObjectCommand).toBeCalledWith({
        Bucket: 'bucket-name',
        Key: createDtrEvent.s3.object.key,
      });

      // Add the S3 information
      expect(PutCommand).toBeCalledTimes(1);
      expect(PutCommand).toBeCalledWith({
        TableName: 'TABLE_FILE_VAL',
        Item: {
          Added: 123456,
          Emergency: 0,
          EndTime: 15,
          Freq: 1234,
          Key: createDtrEvent.s3.object.key,
          Len: 7,
          StartTime: 10,
          Talkgroup: 1234,
          Tone: false,
          ToneIndex: 'n',
          Tower: 'tower',
        },
      });

      // Add the upload delay metric
      expect(PutMetricDataCommand).toBeCalledTimes(1);
      expect(PutMetricDataCommand).toBeCalledWith({
        Namespace: 'DTR Metrics',
        MetricData: [ {
          Dimensions: [ {
            Name: 'Tower',
            Value: 'tower',
          }, ],
          MetricName: 'UploadTime',
          Unit: 'Seconds',
          Value: 108,
        }, ],
      });

      // Query to find possible adjacent files
      expect(QueryCommand).toBeCalledTimes(1);
      expect(QueryCommand).toBeCalledWith({
        TableName: 'TABLE_FILE_VAL',
        ExpressionAttributeNames: {
          '#StartTime': 'StartTime',
          '#Talkgroup': 'Talkgroup',
        },
        ExpressionAttributeValues: {
          ':StartTime1': -50,
          ':StartTime2': 70,
          ':Talkgroup': 1234,
        },
        IndexName: 'StartTimeTgIndex',
        KeyConditionExpression: '#Talkgroup = :Talkgroup AND #StartTime BETWEEN :StartTime1 AND :StartTime2',
      });

      // Get the talkgroup to make sure it is in use
      expect(GetCommand).toBeCalledTimes(1);
      expect(GetCommand).toBeCalledWith({
        TableName: 'TABLE_TALKGROUP_VAL',
        Key: {
          ID: 1234,
        },
      });

      // Set the talkgroup to in use
      expect(UpdateCommand).toBeCalledTimes(1);
      expect(UpdateCommand).toBeCalledWith({
        TableName: 'TABLE_TALKGROUP_VAL',
        Key: {
          ID: 1234,
        },
        ExpressionAttributeNames: {
          '#InUse': 'InUse',
        },
        ExpressionAttributeValues: {
          ':InUse': 'Y',
        },
        UpdateExpression: 'SET #InUse = :InUse',
      });
    });

    it('Picks the right file if multiple start near the same time', async () => {
      jest.useFakeTimers().setSystemTime(123456);

      S3Mock.setResult('head', createDtrHeadInfo);

      DynamoDBDocumentClientMock.setResult('query', {
        Items: [
          {
            Key: 'key-1', // Deleted because length less than key-2
            StartTime: 10,
            EndTime: 15,
            Len: 5,
            Added: 1234,
            Talkgroup: 8332,
          },
          {
            Key: 'key-2',
            StartTime: -5,
            EndTime: 15,
            Len: 20,
            Added: 5678,
            Talkgroup: 8332,
          },
          {
            Key: 'key-3', // Deleted because Added > key-2 Added
            StartTime: 0,
            EndTime: 20,
            Len: 20,
            Added: 9012,
            Talkgroup: 8332,
          },
        ],
      });

      await mod.main({
        Records: [ createDtrEvent, ],
      });

      expect(DeleteCommand).toBeCalledTimes(2);
      expect(DeleteCommand).toBeCalledWith({
        TableName: 'TABLE_FILE_VAL',
        Key: {
          Added: 1234,
          Talkgroup: 8332,
        },
      });
      expect(DeleteCommand).toBeCalledWith({
        TableName: 'TABLE_FILE_VAL',
        Key: {
          Added: 9012,
          Talkgroup: 8332,
        },
      });

      expect(DeleteObjectCommand).toBeCalledTimes(2);
      expect(DeleteObjectCommand).toBeCalledWith({
        Bucket: 'bucket-name',
        Key: 'key-1',
      });
      expect(DeleteObjectCommand).toBeCalledWith({
        Bucket: 'bucket-name',
        Key: 'key-3',
      });
    });

    it('Handles a VHF file being created', async () => {
      jest.useFakeTimers().setSystemTime(123456);

      S3Mock.setResult('head', createVhfHeadInfo);

      await mod.main({
        Records: [ createVhfEvent, ],
      });

      // Call to get the S3 information
      expect(HeadObjectCommand).toBeCalledTimes(1);
      expect(HeadObjectCommand).toBeCalledWith({
        Bucket: 'bucket-name',
        Key: createVhfEvent.s3.object.key,
      });

      // Add the S3 information
      expect(PutCommand).toBeCalledTimes(1);
      expect(PutCommand).toBeCalledWith({
        TableName: 'TABLE_FILE_VAL',
        Item: {
          Added: 123456,
          Emergency: 0,
          EndTime: 17,
          Freq: 154445000,
          Key: createVhfEvent.s3.object.key,
          Len: 15,
          StartTime: 2,
          Talkgroup: 18331,
          Tone: false,
          ToneIndex: 'n',
          Tower: 'vhf',
        },
      });

      // Add the VHF upload metric
      expect(PutMetricDataCommand).toBeCalledTimes(1);
      expect(PutMetricDataCommand).toBeCalledWith({
        Namespace: 'CVFD API',
        MetricData: [ {
          Dimensions: [
            {
              Name: 'source',
              Value: 'S3',
            },
            {
              Name: 'action',
              Value: 'createVHF',
            },
          ],
          MetricName: 'Call',
          Timestamp: new Date(),
          Unit: 'Count',
          Value: 1,
        }, ],
      });

      // Query to find possible adjacent files
      expect(QueryCommand).toBeCalledTimes(0);

      // Get the talkgroup to make sure it is in use
      expect(GetCommand).toBeCalledTimes(1);
      expect(GetCommand).toBeCalledWith({
        TableName: 'TABLE_TALKGROUP_VAL',
        Key: {
          ID: 18331,
        },
      });

      // Set the talkgroup to in use
      expect(UpdateCommand).toBeCalledTimes(1);
      expect(UpdateCommand).toBeCalledWith({
        TableName: 'TABLE_TALKGROUP_VAL',
        Key: {
          ID: 18331,
        },
        ExpressionAttributeNames: {
          '#InUse': 'InUse',
        },
        ExpressionAttributeValues: {
          ':InUse': 'Y',
        },
        UpdateExpression: 'SET #InUse = :InUse',
      });
    });

    it('Starts a transcription job if the file is a page', async () => {
      jest.useFakeTimers().setSystemTime(123456);

      S3Mock.setResult('head', createDtrPageHeadInfo);

      await mod.main({
        Records: [ createDtrEvent, ],
      });

      // Start transcription
      expect(StartTranscriptionJobCommand).toHaveBeenCalledTimes(1);
      expect(StartTranscriptionJobCommand).toHaveBeenCalledWith({
        LanguageCode: 'en-US',
        Media: {
          MediaFileUri: `s3://${createDtrEvent.s3.bucket.name}/${createDtrEvent.s3.object.key}`,
        },
        Settings: {
          MaxSpeakerLabels: 5,
          ShowSpeakerLabels: true,
          VocabularyName: 'SagVocab',
        },
        Tags: [
          {
            Key: 'Talkgroup',
            Value: '8198',
          },
          {
            Key: 'File',
            Value: '8332-1745367697_851475000.0-call_227155.m4a',
          },
          {
            Key: 'FileKey',
            Value: 'audio/dtr/8332-1745367697_851475000.0-call_227155.m4a',
          },
          {
            Key: 'IsPage',
            Value: 'y',
          },
          {
            Key: 'CostCenter',
            Value: 'NSCAD',
          },
        ],
        TranscriptionJobName: '8198-123456',
      });
    });

    it('Starts a transcription job if the file is emegency traffic', async () => {
      jest.useFakeTimers().setSystemTime(123456);

      S3Mock.setResult('head', createDtrEmergencyHeadInfo);

      await mod.main({
        Records: [ createDtrEvent, ],
      });

      // Start transcription
      expect(StartTranscriptionJobCommand).toHaveBeenCalledTimes(1);
      expect(StartTranscriptionJobCommand).toHaveBeenCalledWith({
        LanguageCode: 'en-US',
        Media: {
          MediaFileUri: `s3://${createDtrEvent.s3.bucket.name}/${createDtrEvent.s3.object.key}`,
        },
        Settings: {
          MaxSpeakerLabels: 5,
          ShowSpeakerLabels: true,
          VocabularyName: 'SagVocab',
        },
        Tags: [
          {
            Key: 'Talkgroup',
            Value: '1234',
          },
          {
            Key: 'File',
            Value: '8332-1745367697_851475000.0-call_227155.m4a',
          },
          {
            Key: 'FileKey',
            Value: 'audio/dtr/8332-1745367697_851475000.0-call_227155.m4a',
          },
          {
            Key: 'IsPage',
            Value: 'n',
          },
        ],
        TranscriptionJobName: '1234-123456',
      });
    });

    it('Sends a command to the SQS queue if the file is a page', async () => {
      jest.useFakeTimers().setSystemTime(123456);

      S3Mock.setResult('head', createDtrPageHeadInfo);

      await mod.main({
        Records: [ createDtrEvent, ],
      });

      // Check for the SQS queue message
      expect(SendMessageCommand).toHaveBeenCalledTimes(1);
      expect(SendMessageCommand).toHaveBeenCalledWith({
        QueueUrl: 'SQS_QUEUE_VAL',
        MessageBody: JSON.stringify({
          action: 'page',
          tg: 8198,
          key: '8332-1745367697_851475000.0-call_227155.m4a',
          len: 7,
          isTest: false,
        }),
      });
    });

    it.todo('Does not send a command to the SQS queue if the file is a page but is a duplicate');

    it.todo('Handles deleting a deleted item from the database');
  });
});
