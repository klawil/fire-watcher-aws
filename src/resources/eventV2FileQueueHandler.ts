import {
  BatchCreatePartitionCommand,
  BatchGetPartitionCommand,
  GlueClient
} from '@aws-sdk/client-glue';
import {
  S3Event, S3EventRecord
} from 'aws-lambda';

import {
  BUCKET_EVENTS_V2,
  GLUE_DATABASE, GLUE_TABLE_V2
} from '@/types/backend/environment';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('resources/eventFileQueueHandler');

interface EventPartition {
  datetime: string;
  path: string;
}

const config = {
  table: GLUE_TABLE_V2(),
  columns: [
    {
      Name: 'event',
      Type: 'string',
    },
    {
      Name: 'system',
      Type: 'string',
    },
    {
      Name: 'opcode',
      Type: 'tinyint',
    },
    {
      Name: 'duplex',
      Type: 'boolean',
    },
    {
      Name: 'emergency',
      Type: 'boolean',
    },
    {
      Name: 'encrypted',
      Type: 'boolean',
    },
    {
      Name: 'freq',
      Type: 'int',
    },
    {
      Name: 'mode',
      Type: 'boolean',
    },
    {
      Name: 'phase2_tdma',
      Type: 'boolean',
    },
    {
      Name: 'priority',
      Type: 'tinyint',
    },
    {
      Name: 'source',
      Type: 'int',
    },
    {
      Name: 'talkgroup',
      Type: 'int',
    },
    {
      Name: 'tdma_slot',
      Type: 'int',
    },
  ],
};

async function checkAndCreatePartitions(
  glue: GlueClient,
  eventPartitions: EventPartition[]
): Promise<number> {
  if (eventPartitions.length === 0) {
    return 0;
  }

  // Fetch the existing partition information
  const existingPartitions = await glue.send(new BatchGetPartitionCommand({
    DatabaseName: GLUE_DATABASE(),
    TableName: config.table,
    PartitionsToGet: eventPartitions.map(p => ({
      Values: [ p.datetime, ],
    })),
  }));

  // Figure out which partitions are new
  const newPartitions = eventPartitions.filter(p => !existingPartitions.Partitions?.some(ep =>
    ep.Values?.[0] === p.datetime));

  // Make the new partitions
  if (newPartitions.length > 0) {
    await glue.send(new BatchCreatePartitionCommand({
      DatabaseName: GLUE_DATABASE(),
      TableName: config.table,
      PartitionInputList: newPartitions.map(p => ({
        Values: [ p.datetime, ],
        StorageDescriptor: {
          Location: `s3://${BUCKET_EVENTS_V2()}/${p.path}`,
          Columns: config.columns,
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
    const matches = path.match(/datetime=([^\/]+)\//);
    if (matches === null) {
      return {
        datetime: '',
        path,
        isV2: false,
      };
    }

    return {
      datetime: matches[1],
      path,
    };
  });

  // Generate new partitions
  const glue = new GlueClient();
  const newV2Partitions = await checkAndCreatePartitions(
    glue,
    eventPartitions
  );

  // Log the messages received
  logger.log(`Records: ${s3EventRecords.length}, ` +
    `Partitions: ${eventPartitions.length}, New V2 Partitions: ${newV2Partitions}`);
}
