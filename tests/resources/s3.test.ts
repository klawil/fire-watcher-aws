import { S3EventRecord } from 'aws-lambda';
import {
  describe, expect, it,
  vi
} from 'vitest';

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
import {
  typedPutItem,
  typedQuery,
  typedUpdate
} from '@/utils/backend/dynamoTyped';

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
const createDtrItem = {
  Key: 'audio/dtr/8332-1745367697_851475000.0-call_227155.m4a',
  Added: 123456,
  Talkgroup: 8198,
  StartTime: 10,
  EndTime: 15,
  Len: 7,
  Freq: 1234,
  Emergency: 0,
  Tone: true,
  ToneIndex: 'y',
  Tower: 'tower',
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

const currentTime = 123456;

function getFileItem(
  Key: string,
  Added: number,
  StartTime: number,
  EndTime: number,
  Tone: boolean,
  Emergency: boolean,
  Transcript?: string,
  PageSent?: boolean
) {
  return {
    Key,
    Added,
    StartTime,
    EndTime,
    Len: EndTime - StartTime,
    Freq: 1234,
    Emergency: Emergency ? 1 : 0,
    Tone,
    ToneIndex: Tone ? 'y' : 'n',
    Tower: 'tower',
    Transcript,
    PageSent,
  };
}

describe('resources/s3', () => {
  describe('main', () => {
    it('Handles a DTR file being created', async () => {
      vi.useFakeTimers().setSystemTime(currentTime);

      S3Mock.setResult('head', {
        ...createDtrHeadInfo,
        Metadata: {
          ...createDtrHeadInfo.Metadata,
          source_list: JSON.stringify([
            {
              pos: 0,
              src: 1,
            },
            {
              pos: 1,
              src: 2,
            },
          ]),
        },
      });

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
      expect(PutCommand).toBeCalledTimes(3);
      expect(PutCommand).toBeCalledWith({
        TableName: 'TABLE_FILE_VAL',
        Item: {
          Added: currentTime,
          DeviceProcessed: true,
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
          Sources: [
            1,
            2,
          ],
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
      expect(GetCommand).toBeCalledTimes(0);

      // Set the talkgroup to in use
      expect(UpdateCommand).toBeCalledTimes(3);
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
      expect(UpdateCommand).toBeCalledWith({
        TableName: 'TABLE_RADIOS_VAL',
        Key: {
          RadioID: '1',
        },
        ExpressionAttributeNames: {
          '#InUse': 'InUse',
        },
        ExpressionAttributeValues: {
          ':InUse': 'Y',
        },
        UpdateExpression: 'SET #InUse = :InUse',
      });
      expect(UpdateCommand).toBeCalledWith({
        TableName: 'TABLE_RADIOS_VAL',
        Key: {
          RadioID: '2',
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
      vi.useFakeTimers().setSystemTime(currentTime);

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
      vi.useFakeTimers().setSystemTime(currentTime);

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
          Added: currentTime,
          DeviceProcessed: true,
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

      // No Get commands
      expect(GetCommand).toBeCalledTimes(0);

      // Set the talkgroup and radio IDs to in use
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
      vi.useFakeTimers().setSystemTime(currentTime);

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
            Key: 'Duration',
            Value: '7',
          },
          {
            Key: 'CostCenter',
            Value: 'COFRN',
          },
        ],
        TranscriptionJobName: '8198-123456',
      });
    });

    it('Starts a transcription job if the file is emegency traffic', async () => {
      vi.useFakeTimers().setSystemTime(currentTime);

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
          {
            Key: 'Duration',
            Value: '7',
          },
          {
            Key: 'CostCenter',
            Value: 'COFRN',
          },
        ],
        TranscriptionJobName: '1234-123456',
      });
    });

    it('Sends a command to the SQS queue if the file is a page', async () => {
      vi.useFakeTimers().setSystemTime(currentTime);

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

    it('Does not send a command to the SQS queue if the file is a page but is a duplicate', async () => {
      vi.useFakeTimers().setSystemTime(currentTime);

      S3Mock.setResult('head', createDtrPageHeadInfo);

      vi.mocked(typedQuery).mockImplementation(() => {
        return Promise.resolve({
          '$metadata': {},
          Items: [
            {
              Key: 'key-1',
              StartTime: 10,
              EndTime: 15,
              Len: 5,
              Added: 1234,
              Talkgroup: 8332,
              IsPage: true,
            },
            {
              Key: 'key-2',
              StartTime: -5,
              EndTime: 15,
              Len: 20,
              Added: 5678,
              Talkgroup: 8332,
              IsPage: true,
              Transcript: 'test',
            },
            {
              Key: 'key-3',
              StartTime: 0,
              EndTime: 20,
              Len: 20,
              Added: 9012,
              Talkgroup: 8332,
              IsPage: true,
            },
          ],
        });
      });

      await mod.main({
        Records: [ createDtrEvent, ],
      });

      expect(StartTranscriptionJobCommand).toHaveBeenCalledTimes(0);
    });

    it('Copies the transcript from another page recording if available', async () => {
      vi.useFakeTimers().setSystemTime(currentTime);

      S3Mock.setResult('head', createDtrPageHeadInfo);

      vi.mocked(typedQuery).mockResolvedValue({
        Items: [
          createDtrItem,
          getFileItem(
            'lower-length',
            currentTime - 1000,
            createDtrItem.StartTime + 5,
            createDtrItem.EndTime,
            true,
            false,
            'Transcript 11'
          ),
          getFileItem(
            'added-before',
            currentTime - 1000,
            createDtrItem.StartTime,
            createDtrItem.EndTime,
            true,
            false,
            'Transcript 2',
            true
          ),
        ],
        '$metadata': {},
      });

      await mod.main({
        Records: [ createDtrEvent, ],
      });

      expect(StartTranscriptionJobCommand).toHaveBeenCalledTimes(1);
      expect(SendMessageCommand).toHaveBeenCalledTimes(0);

      expect(typedUpdate).toHaveBeenCalledWith({
        TableName: 'TABLE_FILE_VAL',
        Key: {
          Talkgroup: 8198,
          Added: currentTime,
        },
        ExpressionAttributeNames: {
          '#Transcript': 'Transcript',
        },
        ExpressionAttributeValues: {
          ':Transcript': 'Transcript 11',
        },
        UpdateExpression: 'SET #Transcript = :Transcript',
      });
    });

    it('Adds files to the translation table if not keeping the current item', async () => {
      vi.useFakeTimers().setSystemTime(currentTime);

      S3Mock.setResult('head', createDtrPageHeadInfo);

      vi.mocked(typedQuery).mockResolvedValue({
        Items: [
          createDtrItem,
          getFileItem(
            'lower-length',
            currentTime - 1000,
            createDtrItem.StartTime + 5,
            createDtrItem.EndTime,
            true,
            false,
            'Transcript 1'
          ),
          getFileItem(
            'longer',
            currentTime - 1000,
            createDtrItem.StartTime,
            createDtrItem.EndTime + 2,
            true,
            false,
            'Transcript 2',
            true
          ),
        ],
        '$metadata': {},
      });

      await mod.main({
        Records: [ createDtrEvent, ],
      });

      expect(StartTranscriptionJobCommand).toHaveBeenCalledTimes(0);
      expect(SendMessageCommand).toHaveBeenCalledTimes(0);

      expect(typedPutItem).toHaveBeenCalledWith({
        TableName: 'TABLE_DTR_TRANSLATION_VAL',
        Item: {
          Key: createDtrItem.Key,
          NewKey: 'longer',
          TTL: 3723,
        },
      });
      expect(typedPutItem).toHaveBeenCalledWith({
        TableName: 'TABLE_DTR_TRANSLATION_VAL',
        Item: {
          Key: 'lower-length',
          NewKey: 'longer',
          TTL: 3723,
        },
      });
    });

    it('Marks the page as sent if it is kept from duplicates', async () => {
      vi.useFakeTimers().setSystemTime(currentTime);

      S3Mock.setResult('head', createDtrPageHeadInfo);

      vi.mocked(typedQuery).mockResolvedValue({
        Items: [
          createDtrItem,
          getFileItem(
            'lower-length',
            currentTime - 1000,
            createDtrItem.StartTime + 5,
            createDtrItem.EndTime,
            true,
            false,
            'Transcript 1'
          ),
          getFileItem(
            'added-before',
            currentTime - 2000,
            createDtrItem.StartTime,
            createDtrItem.EndTime,
            true,
            false,
            'Transcript 2'
          ),
        ],
        '$metadata': {},
      });

      await mod.main({
        Records: [ createDtrEvent, ],
      });

      expect(StartTranscriptionJobCommand).toHaveBeenCalledTimes(1);
      expect(SendMessageCommand).toHaveBeenCalledTimes(1);

      expect(typedUpdate).toHaveBeenCalledWith({
        TableName: 'TABLE_FILE_VAL',
        Key: {
          Talkgroup: 8198,
          Added: currentTime,
        },
        ExpressionAttributeNames: {
          '#PageSent': 'PageSent',
        },
        ExpressionAttributeValues: {
          ':PageSent': true,
        },
        UpdateExpression: 'SET #PageSent = :PageSent',
      });
    });

    it('Marks the page as sent if it is not a duplicate', async () => {
      vi.useFakeTimers().setSystemTime(currentTime);

      S3Mock.setResult('head', createDtrPageHeadInfo);

      vi.mocked(typedQuery).mockResolvedValue({
        Items: [
          createDtrItem,
          getFileItem(
            'too-early-key',
            currentTime - 1000,
            createDtrItem.StartTime - 10,
            createDtrItem.StartTime - 5,
            true,
            false
          ),
        ],
        '$metadata': {},
      });

      await mod.main({
        Records: [ createDtrEvent, ],
      });

      expect(StartTranscriptionJobCommand).toHaveBeenCalledTimes(1);
      expect(SendMessageCommand).toHaveBeenCalledTimes(1);

      expect(typedUpdate).toHaveBeenCalledWith({
        TableName: 'TABLE_FILE_VAL',
        Key: {
          Talkgroup: 8198,
          Added: currentTime,
        },
        ExpressionAttributeNames: {
          '#PageSent': 'PageSent',
        },
        ExpressionAttributeValues: {
          ':PageSent': true,
        },
        UpdateExpression: 'SET #PageSent = :PageSent',
      });
    });

    it.todo('Adds a line to the mapping table for deleted emergency traffic');

    it.todo('Adds a line to the mapping table for deleted page traffic');

    it.todo('Keeps the longer transcript if there are multiple');

    it.todo('Handles deleting a deleted item from the database');
  });
});
