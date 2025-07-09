import {
  BatchCreatePartitionCommand,
  BatchGetPartitionCommand,
  GlueClient
} from '@aws-sdk/client-glue';
import {
  S3Event, S3EventRecord
} from 'aws-lambda';

const glueDatabase = process.env.GLUE_DATABASE;
const glueTable = process.env.GLUE_TABLE;

export async function main(event: S3Event) {
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
  const eventPartitions: {
    datetime: string;
    event: string;
    path: string;
  }[] = paths.map(path => {
    const matches = path.match(/datetime=([^\/]+)\/event=([^\/]+)\//);
    if (matches === null) {
      return {
        datetime: '',
        event: '',
        path,
      };
    }

    return {
      datetime: matches[1],
      event: matches[2],
      path,
    };
  });

  // Fetch the partition information
  const glue = new GlueClient();
  const existingPartitions = await glue.send(new BatchGetPartitionCommand({
    DatabaseName: glueDatabase,
    TableName: glueTable,
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
      DatabaseName: glueDatabase,
      TableName: glueTable,
      PartitionInputList: newPartitions.map(p => ({
        Values: [
          p.datetime,
          p.event,
        ],
        StorageDescriptor: {
          Location: `s3://${process.env.EVENTS_S3_BUCKET}/${p.path}`,
          Columns: [
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
          InputFormat: 'org.apache.hadoop.hive.ql.io.orc.OrcInputFormat',
          OutputFormat: 'org.apache.hadoop.hive.ql.io.orc.OrcOutputFormat',
          SerdeInfo: {
            SerializationLibrary: 'org.apache.hadoop.hive.ql.io.orc.OrcSerde',
          },
        },
      })),
    }));
  }

  // Log the messages received
  console.log(`Records: ${s3EventRecords.length}, ` +
    `Partitions: ${eventPartitions.length}, New Partitions: ${newPartitions.length}`);
}
