import {
  CloudWatchClient, PutMetricDataCommand,
  PutMetricDataCommandInput
} from '@aws-sdk/client-cloudwatch';
import {
  DeleteObjectCommand, HeadObjectCommand, S3Client
} from '@aws-sdk/client-s3';
import {
  SQSClient,
  SendMessageCommand
} from '@aws-sdk/client-sqs';
import {
  StartTranscriptionJobCommand, StartTranscriptionJobRequest, TranscribeClient
} from '@aws-sdk/client-transcribe';
import * as lambda from 'aws-lambda';

import { incrementMetric } from '@/deprecated/utils/general';
import {
  FileTranslationObject, FullFileObject
} from '@/types/api/files';
import { FullTalkgroupObject } from '@/types/api/talkgroups';
import { PagingTalkgroup } from '@/types/api/users';
import { PhoneNumberAccount } from '@/types/backend/department';
import {
  TypedDeleteItemInput, TypedPutItemInput
} from '@/types/backend/dynamo';
import { SendPageQueueItem } from '@/types/backend/queue';
import {
  TABLE_FILE, TABLE_FILE_TRANSLATION, TABLE_TALKGROUP, typedDeleteItem, typedGet, typedPutItem,
  typedQuery, typedUpdate
} from '@/utils/backend/dynamoTyped';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('s3');
const s3 = new S3Client();
const sqs = new SQSClient();
const transcribe = new TranscribeClient();
const cloudwatch = new CloudWatchClient();

const sqsQueue = process.env.SQS_QUEUE;

const metricSource = 'S3';

const selectDuplicateBuffer = 60; // Select calls 60s each way for analysis for duplicates
const actualDuplicateBuffer = 1; // Check for calls 1s each way for DTR duplicates

const vhfConfig: {
  [key: string]: {
    tg: number;
    freq: number;
  }
} = {
  'BG_FIRE_VHF': {
    tg: 18331,
    freq: 154445000,
  },
  'SAG_FIRE_VHF': {
    tg: 18332,
    freq: 154190000,
  },
};

interface SourceListItem {
  pos: number;
  src: number;
}

const talkgroupsToTag: {
  [key: string]: PhoneNumberAccount;
} = {
  '8198': 'NSCAD',
  '8332': 'Crestone',
  '18332': 'Crestone',
  '18331': 'Baca',
  '8331': 'Baca',
};

async function parseRecord(record: lambda.S3EventRecord): Promise<void> {
  logger.trace('parseRecord', ...arguments);
  const Bucket = record.s3.bucket.name;
  const Key = record.s3.object.key;

  if (record.eventName.indexOf('ObjectCreated') === 0) {
    const promises: {
      [key: string]: Promise<unknown>;
    } = {};

    if (!Key.includes('/dtr')) {
      const metric = incrementMetric('Call', {
        source: metricSource,
        action: 'createVHF',
      }, false);
      promises['call-metric'] = metric;
    }
    const headInfo = await s3.send(new HeadObjectCommand({
      Bucket,
      Key,
    }));

    const addedTime = Date.now();
    const body: TypedPutItemInput<FullFileObject> = {
      TableName: TABLE_FILE,
      Item: {
        Key: Key,
        Added: addedTime,
        Talkgroup: -1,
      },
    };

    const sourceList: number[] = [];
    let config: {
      tg: number;
      freq: number;
    } = {
      tg: -1,
      freq: 0,
    };
    let fileTag: PhoneNumberAccount | null = null;
    if (Key.indexOf('/dtr') !== -1) {
      try {
        if (typeof headInfo.Metadata?.source_list !== 'undefined') {
          JSON.parse(headInfo.Metadata?.source_list)
            .map((v: SourceListItem) => v.src)
            .filter((v: number, i: number, a: number[]) => a.indexOf(v) === i && Number(v) > 0)
            .forEach((source: number) => sourceList.push(source));
        }
      } catch (e) {} // eslint-disable-line @typescript-eslint/no-unused-vars

      body.Item = {
        ...body.Item,
        StartTime: Number(headInfo.Metadata?.start_time),
        EndTime: Number(headInfo.Metadata?.stop_time),
        Len: Number(headInfo.Metadata?.call_length),
        Freq: Number(headInfo.Metadata?.freq),
        Emergency: headInfo.Metadata?.emergency === '1' ? 1 : 0,
        Tone: headInfo.Metadata?.tone === 'true',
        ToneIndex: headInfo.Metadata?.tone === 'true' ? 'y' : 'n',
        Tower: headInfo.Metadata?.source,
        Sources: sourceList,
        Talkgroup: Number(headInfo.Metadata?.talkgroup_num),
      };
      if (
        headInfo.Metadata?.talkgroup_num &&
        typeof talkgroupsToTag[headInfo.Metadata?.talkgroup_num] !== 'undefined'
      ) {
        fileTag = talkgroupsToTag[headInfo.Metadata?.talkgroup_num];
      }
      if (sourceList.length === 0) {
        delete body.Item.Sources;
      }

      const towerUploadMetrics: PutMetricDataCommandInput['MetricData'] = [ {
        MetricName: 'UploadTime',
        Dimensions: [ {
          Name: 'Tower',
          Value: headInfo.Metadata?.source as string,
        }, ],
        Unit: 'Seconds',
        Value: Math.round(addedTime / 1000) - Number(headInfo.Metadata?.stop_time),
      }, ];

      promises['put-metric-data'] = cloudwatch.send(new PutMetricDataCommand({
        Namespace: 'DTR Metrics',
        MetricData: towerUploadMetrics,
      }));
    } else {
      for (const vhfKey in vhfConfig) {
        if (Key.indexOf(vhfKey) !== -1) {
          config = vhfConfig[vhfKey];
        }
      }

      body.Item = {
        ...body.Item,
        StartTime: Number(headInfo.Metadata?.datetime) / 1000,
        EndTime: (Number(headInfo.Metadata?.datetime) / 1000) + Number(headInfo.Metadata?.len || '0'),
        Len: Number(headInfo.Metadata?.len),
        Freq: config.freq,
        Emergency: 0,
        Tone: headInfo.Metadata?.tone === 'y',
        ToneIndex: headInfo.Metadata?.tone === 'y' ? 'y' : 'n',
        Tower: 'vhf',
        Talkgroup: config.tg,
      };
      if (typeof talkgroupsToTag[config.tg] !== 'undefined') {
        fileTag = talkgroupsToTag[config.tg];
      }
    }
    await typedPutItem<FullFileObject>(body);

    let doTranscriptOnly: boolean = false;
    const isPage: boolean = !!body.Item.Tone;
    const shouldDoTranscript: boolean = body.Item.Emergency === 1 ||
      isPage;
    if (Key.indexOf('/dtr') !== -1) {
      const startTime = body.Item.StartTime as number;
      const endTime = body.Item.EndTime as number;
      const existingItems = await typedQuery<FullFileObject>({
        TableName: TABLE_FILE,
        IndexName: 'StartTimeTgIndex',
        ExpressionAttributeNames: {
          '#Talkgroup': 'Talkgroup',
          '#StartTime': 'StartTime',
        },
        ExpressionAttributeValues: {
          ':Talkgroup': body.Item.Talkgroup,
          ':StartTime1': startTime - selectDuplicateBuffer,
          ':StartTime2': startTime + selectDuplicateBuffer,
        },
        KeyConditionExpression: '#Talkgroup = :Talkgroup AND #StartTime BETWEEN :StartTime1 AND :StartTime2',
      });
      if (
        !!existingItems.Items &&
        existingItems.Items.length > 1
      ) {
        const matchingItems = existingItems.Items
          .filter(item => {
            const itemStartTime = item.StartTime;
            const itemEndTime = item.EndTime;
            if (
              typeof itemStartTime === 'undefined' ||
              typeof itemEndTime === 'undefined'
            ) {
              return false;
            }

            // Return true if the file starts in, ends in, or covers the buffer period
            const startsIn = itemStartTime >= startTime - actualDuplicateBuffer &&
              itemStartTime <= endTime + actualDuplicateBuffer;
            const endsIn = itemEndTime >= startTime - actualDuplicateBuffer &&
              itemEndTime <= endTime + actualDuplicateBuffer;
            const covers = itemStartTime <= startTime - actualDuplicateBuffer &&
              itemEndTime >= endTime + actualDuplicateBuffer;
            return startsIn || endsIn || covers;
          });

        if (matchingItems.length > 1) {
          doTranscriptOnly = true; // So we don't accidentally double page
          const transcript: string | null = matchingItems
            .reduce((transcript: null | string, item) => {
              if (item.Transcript) {
                return transcript !== null && transcript.length > item.Transcript.length
                  ? transcript
                  : item.Transcript;
              }
              return null;
            }, null);
          const allItems = matchingItems
            .sort((a, b) => {
              const aAdded = a.Added;
              const bAdded = b.Added;
              const aLen = a.Len;
              const bLen = b.Len;

              if (aLen === bLen) {
                return aAdded > bAdded ? -1 : 1;
              }

              return (aLen || 0) > (bLen || 0) ? 1 : -1;
            });
          const itemsToDelete = allItems
            .slice(0, -1);
          const keptItem = allItems.slice(-1)[0];
          const keepingCurrentItem: boolean = keptItem.Key === Key;
          if (isPage) {
            logger.error('itemsToDelete', itemsToDelete);
            logger.error('keptItem', keptItem);
            logger.error('body', body.Item);
          } else {
            logger.debug('itemsToDelete', itemsToDelete);
            logger.debug('keptItem', keptItem);
            logger.debug('body', body.Item);
          }
          promises['delete-dups'] = Promise.all(itemsToDelete.map(item => typedDeleteItem<FullFileObject>({
            TableName: TABLE_FILE,
            Key: {
              Talkgroup: item.Talkgroup,
              Added: item.Added,
            },
          })));
          promises['delete-s3-dups'] = Promise.all(itemsToDelete.map(item => {
            if (typeof item.Key === 'undefined') {
              return;
            }

            return s3.send(new DeleteObjectCommand({
              Bucket,
              Key: item.Key,
            }));
          }));
          if (shouldDoTranscript && !keepingCurrentItem) {
            promises['translation-table'] = Promise.all(itemsToDelete.map(item => typedPutItem<FileTranslationObject>({
              TableName: TABLE_FILE_TRANSLATION,
              Item: {
                Key: item.Key || '',
                NewKey: keptItem.Key || '',
                TTL: Math.round(Date.now() / 1000) + (60 * 60), // 1 hour TTL
              },
            })));
          }
          if (transcript !== null && keepingCurrentItem) {
            promises['add-transcript'] = typedUpdate<FullFileObject>({
              TableName: TABLE_FILE,
              Key: {
                Talkgroup: keptItem.Talkgroup,
                Added: keptItem.Added,
              },
              ExpressionAttributeNames: {
                '#Transcript': 'Transcript',
              },
              ExpressionAttributeValues: {
                ':Transcript': transcript,
              },
              UpdateExpression: 'SET #Transcript = :Transcript',
            });
          }

          // Check to see if we need to send a paging message
          if (
            isPage &&
            keepingCurrentItem &&
            !itemsToDelete.reduce((agg, item) => agg || !!item.PageSent, false)
          ) {
            // Update the current item to indicate a page will have been sent
            doTranscriptOnly = false;
            promises['set-page-sent'] = typedUpdate<FullFileObject>({
              TableName: TABLE_FILE,
              Key: {
                Talkgroup: keptItem.Talkgroup,
                Added: keptItem.Added,
              },
              ExpressionAttributeNames: {
                '#PageSent': 'PageSent',
              },
              ExpressionAttributeValues: {
                ':PageSent': true,
              },
              UpdateExpression: 'SET #PageSent = :PageSent',
            });
          }

          // Check to see if we should redo the transcription
          if (
            !keepingCurrentItem || // We're not saving this file
            !shouldDoTranscript // This file doesn't need a transcript
          ) {
            logger.debug('Duplicate, no transcript or page');
            let wasError = false;
            await Promise.all(Object.keys(promises).map(key => promises[key]
              .catch(e => {
                logger.error(`Error on ${key}`, e);
                wasError = true;
              })));
            if (wasError) {
              throw new Error('Error in promises');
            }
            return;
          }
        } else if (isPage) {
          promises['set-page-sent-nodup'] = typedUpdate<FullFileObject>({
            TableName: TABLE_FILE,
            Key: {
              Talkgroup: body.Item.Talkgroup,
              Added: body.Item.Added,
            },
            ExpressionAttributeNames: {
              '#PageSent': 'PageSent',
            },
            ExpressionAttributeValues: {
              ':PageSent': true,
            },
            UpdateExpression: 'SET #PageSent = :PageSent',
          });
        }
      }
    }

    if (shouldDoTranscript) {
      const transcribeJobName = `${body.Item.Talkgroup}-${Date.now()}`;
      const toneFile = Key.split('/')[2] || Key.split('/')[1];
      const Tags: StartTranscriptionJobRequest['Tags'] = [
        {
          Key: 'Talkgroup', Value: body.Item.Talkgroup.toString(),
        },
        {
          Key: 'File', Value: toneFile,
        },
        {
          Key: 'FileKey', Value: Key,
        },
        {
          Key: 'IsPage', Value: body.Item.Tone ? 'y' : 'n',
        },
      ];
      if (fileTag !== null) {
        Tags.push({
          Key: 'CostCenter',
          Value: fileTag,
        });
      }
      promises['start-transcribe'] = transcribe.send(new StartTranscriptionJobCommand({
        TranscriptionJobName: transcribeJobName,
        LanguageCode: 'en-US',
        Media: {
          MediaFileUri: `s3://${Bucket}/${Key}`,
        },
        Settings: {
          VocabularyName: 'SagVocab',
          MaxSpeakerLabels: 5,
          ShowSpeakerLabels: true,
        },
        Tags,
      }));

      if (!doTranscriptOnly && body.Item.Tone) {
        logger.debug('Transcript and page');
        const queueMessage: SendPageQueueItem = {
          action: 'page',
          tg: body.Item.Talkgroup as PagingTalkgroup,
          key: toneFile,
          len: body.Item.Len,
          isTest: false,
        };
        promises['page-sqs'] = sqs.send(new SendMessageCommand({
          MessageBody: JSON.stringify(queueMessage),
          QueueUrl: sqsQueue,
        }));
      } else {
        // Exit early if we just wanted to kick off the transcript
        logger.debug('Transcript only');
        let wasError = false;
        await Promise.all(Object.keys(promises).map(key => promises[key]
          .catch(e => {
            logger.error(`Error on ${key}`, e);
            wasError = true;
          })));
        if (wasError) {
          throw new Error('Error in promises');
        }
        return;
      }
    }

    promises['talkgroup-update'] = (async () => {
      const item = await typedGet<FullTalkgroupObject>({
        TableName: TABLE_TALKGROUP,
        Key: {
          ID: body.Item.Talkgroup,
        },
      });

      if (!item.Item || item.Item.InUse !== 'Y') {
        await typedUpdate<FullTalkgroupObject>({
          TableName: TABLE_TALKGROUP,
          Key: {
            ID: body.Item.Talkgroup,
          },
          ExpressionAttributeNames: {
            '#InUse': 'InUse',
          },
          ExpressionAttributeValues: {
            ':InUse': 'Y',
          },
          UpdateExpression: 'SET #InUse = :InUse',
        });
      }
    })();

    let wasError = false;
    await Promise.all(Object.keys(promises).map(key => promises[key]
      .catch(e => {
        logger.error(`Error on ${key}`, e);
        wasError = true;
      })));
    if (wasError) {
      throw new Error('Error in promises');
    }
  } else {
    await incrementMetric('Call', {
      source: metricSource,
      action: 'delete',
    }, false);
    const dynamoQuery = await typedQuery<FullFileObject>({
      TableName: TABLE_FILE,
      IndexName: 'KeyIndex',
      ExpressionAttributeNames: {
        '#Key': 'Key',
      },
      ExpressionAttributeValues: {
        ':Key': Key,
      },
      KeyConditionExpression: '#Key = :Key',
    });

    if (dynamoQuery.Items && dynamoQuery.Items.length > 0) {
      const body: TypedDeleteItemInput<FullFileObject> = {
        Key: {
          Talkgroup: dynamoQuery.Items[0].Talkgroup,
          Added: dynamoQuery.Items[0].Added,
        },
        TableName: TABLE_FILE,
      };
      logger.info('parseRecord', 'delete', body);
      await typedDeleteItem<FullFileObject>(body);
    } else {
      logger.info('parseRecord', 'delete', 'not found', Key);
    }
  }
}

export async function main(event: lambda.S3Event): Promise<void> {
  logger.trace('main', ...arguments);
  try {
    await Promise.all(event.Records.map(parseRecord));
  } catch (e) {
    logger.error('main', e);
  }
}
