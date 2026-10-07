import {
  BatchCreatePartitionCommand,
  BatchGetPartitionCommand,
  GlueClient
} from '@aws-sdk/client-glue';
import {
  S3Event, S3EventRecord
} from 'aws-lambda';

import {
  BUCKET_EVENTS,
  GLUE_DATABASE, GLUE_TABLE
} from '@/types/backend/environment';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('resources/eventFileQueueHandler');

interface EventPartition {
  datetime: string;
  event: string;
  path: string;
  isV2: boolean;
}

const config = {
  old: {
    table: GLUE_TABLE(),
    columns: [
      {
        Name: 'radioid',
        Type: 'string',
      },
      {
        Name: 'talkgroup',
        Type: 'string',
      },
      {
        Name: 'talkgrouplist',
        Type: 'string',
      },
      {
        Name: 'tower',
        Type: 'string',
      },
      {
        Name: 'timestamp',
        Type: 'bigint',
      },
    ],
  },
};

async function checkAndCreatePartitions(
  glue: GlueClient,
  eventPartitions: EventPartition[],
  type: keyof typeof config
): Promise<number> {
  if (eventPartitions.length === 0) {
    return 0;
  }

  const localConfig = config[type];

  // Fetch the existing partition information
  const existingPartitions = await glue.send(new BatchGetPartitionCommand({
    DatabaseName: GLUE_DATABASE(),
    TableName: localConfig.table,
    PartitionsToGet: eventPartitions.map(p => ({
      Values: [
        p.datetime,
        p.event,
      ],
    })),
  }));

  // Figure out which partitions are new
  const newPartitions = eventPartitions.filter(p => !existingPartitions.Partitions?.some(ep =>
    ep.Values?.[0] === p.datetime &&
    ep.Values?.[1] === p.event));

  // Make the new partitions
  if (newPartitions.length > 0) {
    await glue.send(new BatchCreatePartitionCommand({
      DatabaseName: GLUE_DATABASE(),
      TableName: localConfig.table,
      PartitionInputList: newPartitions.map(p => ({
        Values: [
          p.datetime,
          p.event,
        ],
        StorageDescriptor: {
          Location: `s3://${BUCKET_EVENTS()}/${p.path}`,
          Columns: localConfig.columns,
          InputFormat: 'org.apache.hadoop.hive.ql.io.orc.OrcInputFormat',
          OutputFormat: 'org.apache.hadoop.hive.ql.io.orc.OrcOutputFormat',
          SerdeInfo: {
            SerializationLibrary: 'org.apache.hadoop.hive.ql.io.orc.OrcSerde',
          },
        },
      })),
    }));
  }

  return newPartitions.length;
}

export async function main(event: S3Event) {
  logger.trace('main', ...arguments);

  // Get the S3 events
  const s3EventRecords: S3EventRecord[] = event.Records || [];

  // Exit early if no messages
  if (s3EventRecords.length === 0) {
    return;
  }

  // Get all of the prefixes that were created
  const paths = s3EventRecords
    .map(record => {
      const path = record.s3.object.key
        .replace(/[^\/]+$/, '');
      return decodeURIComponent(path);
    })
    .filter((v, i, a) => a.indexOf(v) === i);

  // Attempt to get the associated partitions
  const eventPartitions: EventPartition[] = paths.map(path => {
    const matches = path.match(/datetime=([^\/]+)\/event=([^\/]+)\//);
    if (matches === null) {
      return {
        datetime: '',
        event: '',
        path,
        isV2: false,
      };
    }

    return {
      datetime: matches[1],
      event: matches[2],
      path,
      isV2: path.includes('data-v2/'),
    };
  });

  // Generate new partitions
  const glue = new GlueClient();
  const newV1Partitions = await checkAndCreatePartitions(
    glue,
    eventPartitions.filter(v => !v.isV2),
    'old'
  );

  // Log the messages received
  logger.log(`Records: ${s3EventRecords.length}, ` +
    `Partitions: ${eventPartitions.length}, New V1 Partitions: ${newV1Partitions}`);
}
