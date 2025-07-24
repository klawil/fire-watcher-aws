
import {
  AthenaClient, GetQueryExecutionCommand, GetQueryResultsCommand, StartQueryExecutionCommand
} from '@aws-sdk/client-athena';

import { FileEventItem } from '@/types/api/events';
import { FullFileObject } from '@/types/api/files';
import { RadioObject } from '@/types/api/radios';
import { FullTalkgroupObject } from '@/types/api/talkgroups';
import {
  TABLE_DEVICES, TABLE_FILE, TABLE_RADIOS, TABLE_TALKGROUP, typedQuery, typedScan, typedUpdate
} from '@/utils/backend/dynamoTyped';
import { getLogger } from '@/utils/common/logger';

const radioIdQueryString = `select radioid, count(*) as num
from "cvfd-dtr-events"
where "datetime" like '{{datetime}}'
    and radioid != ''
group by radioid`;

const talkgroupQueryString = `select talkgroup, count(*) as num
from "cvfd-dtr-events"
where "datetime" like '{{datetime}}'
    and talkgroup != ''
group by talkgroup`;

const athena = new AthenaClient();

const logger = getLogger('dailyEvents');

async function processDeviceEvents(allRadios: RadioObject[], queryDate: string) {
  logger.log('Started processDeviceEvents');

  const query = await athena.send(new StartQueryExecutionCommand({
    QueryString: radioIdQueryString.replace(/\{\{datetime\}\}/g, queryDate),
    WorkGroup: process.env.ATHENA_WORKGROUP,
    QueryExecutionContext: {
      Database: process.env.GLUE_DATABASE,
    },
  }));
  if (!query.QueryExecutionId) {
    throw new Error(`Failed to get device query ID (${query})`);
  }
  logger.log(queryDate);

  while (true) {
    await new Promise(res => setTimeout(res, 5000));

    const queryStatus = await athena.send(new GetQueryExecutionCommand({
      QueryExecutionId: query.QueryExecutionId,
    }));
    const queryState = queryStatus.QueryExecution?.Status?.State || 'UNKNOWN';
    if (
      !queryState ||
      queryState === 'CANCELLED' ||
      queryState === 'FAILED'
    ) {
      throw new Error(`Device query status ${queryState} (${query.QueryExecutionId})`);
    }

    if (queryState === 'SUCCEEDED') {
      break;
    }
  }

  // Get the results
  const results = await athena.send(new GetQueryResultsCommand({
    QueryExecutionId: query.QueryExecutionId,
  }));
  if (!results.ResultSet?.Rows) {
    logger.error(`No results returned from device query ID ${query.QueryExecutionId}`);
  }

  // Parse the results
  type Row = {
    radioid: string;
    num: number;
  };
  const names = results.ResultSet?.Rows?.[0].Data?.map(c => c.VarCharValue) || [];
  const athenaResults = results.ResultSet?.Rows?.slice(1)
    .map(r => r.Data?.map(c => c.VarCharValue) || [])
    .map(r => r.reduce((agg: { [key: string]: string | undefined | number }, v, i) => {
      agg[names[i] || 'UNK'] = v;
      if (names[i] === 'num') {
        agg.num = Number(agg.num);
        if (agg.num > 1000) {
          agg.num = 1000;
        }
      }
      return agg as Row;
    }, {})) as Row[] || [];

  await Promise.all(athenaResults
    .filter(row => !allRadios.some(v => v.RadioID === row.radioid &&
      v.EventsCount && v.EventsCount >= 1000))
    .map(row => {
      logger.log(`Updating device events for ${row.radioid}: ${row.num}`);
      return typedUpdate<RadioObject>({
        TableName: TABLE_RADIOS,
        Key: {
          RadioID: row.radioid,
        },
        ExpressionAttributeNames: {
          '#HasEvents': 'HasEvents',
          '#EventsCount': 'EventsCount',
        },
        ExpressionAttributeValues: {
          ':HasEvents': 'Y',
          ':EventsCount': row.num,
          ':EventsBase': 0,
        },
        UpdateExpression: 'SET #HasEvents = :HasEvents, #EventsCount = if_not_exists(#EventsCount, :EventsBase) + :EventsCount',
      });
    }));

  logger.log('Finished processDeviceEvents');
}

async function processTalkgroupEvents(allTalkgroups: FullTalkgroupObject[], queryDate: string) {
  logger.log('Started processTalkgroupEvents');

  const query = await athena.send(new StartQueryExecutionCommand({
    QueryString: talkgroupQueryString.replace(/\{\{datetime\}\}/g, queryDate),
    WorkGroup: process.env.ATHENA_WORKGROUP,
    QueryExecutionContext: {
      Database: process.env.GLUE_DATABASE,
    },
  }));
  if (!query.QueryExecutionId) {
    throw new Error(`Failed to get talkgroup query ID (${query})`);
  }

  while (true) {
    await new Promise(res => setTimeout(res, 5000));

    const queryStatus = await athena.send(new GetQueryExecutionCommand({
      QueryExecutionId: query.QueryExecutionId,
    }));
    const queryState = queryStatus.QueryExecution?.Status?.State || 'UNKNOWN';
    if (
      !queryState ||
      queryState === 'CANCELLED' ||
      queryState === 'FAILED'
    ) {
      throw new Error(`Talkgroup query status ${queryState} (${query.QueryExecutionId})`);
    }

    if (queryState === 'SUCCEEDED') {
      break;
    }
  }

  // Get the results
  const results = await athena.send(new GetQueryResultsCommand({
    QueryExecutionId: query.QueryExecutionId,
  }));
  if (!results.ResultSet?.Rows) {
    logger.error(`No results returned from talkgroup query ID ${query.QueryExecutionId}`);
  }

  // Parse the results
  type Row = {
    talkgroup: string;
    num: number;
  };
  const names = results.ResultSet?.Rows?.[0].Data?.map(c => c.VarCharValue) || [];
  const athenaResults = results.ResultSet?.Rows?.slice(1)
    .map(r => r.Data?.map(c => c.VarCharValue) || [])
    .map(r => r.reduce((agg: { [key: string]: string | undefined | number }, v, i) => {
      agg[names[i] || 'UNK'] = v;
      if (names[i] === 'num') {
        agg.num = Number(agg.num);
        if (agg.num > 1000) {
          agg.num = 1000;
        }
      }
      return agg as Row;
    }, {})) as Row[] || [];

  await Promise.all(athenaResults
    .filter(row => !allTalkgroups.some(v => v.ID.toString() === row.talkgroup &&
      v.EventsCount && v.EventsCount >= 1000))
    .map(row => {
      logger.log(`Updating talkgroup events for ${row.talkgroup}: ${row.num}`);
      return typedUpdate<FullTalkgroupObject>({
        TableName: TABLE_TALKGROUP,
        Key: {
          ID: Number(row.talkgroup),
        },
        ExpressionAttributeNames: {
          '#HasEvents': 'HasEvents',
          '#EventsCount': 'EventsCount',
        },
        ExpressionAttributeValues: {
          ':HasEvents': 'Y',
          ':EventsCount': row.num,
          ':EventsBase': 0,
        },
        UpdateExpression: 'SET #HasEvents = :HasEvents, #EventsCount = if_not_exists(#EventsCount, :EventsBase) + :EventsCount',
      });
    }));

  logger.log('Completed processTalkgroupEvents');
}

async function processDeviceRecordings(
  allRadios: RadioObject[],
  startTime: number,
  endTime: number
) {
  logger.log('Started processDeviceRecordings');

  // Loop over all of the radio IDs
  const radios = allRadios.filter(v => v.InUse === 'Y' && (!v.Count || v.Count < 1000));
  let radiosIdx = 0;
  const runner = async () => {
    while (true) {
      const idx = radiosIdx++;
      if (idx >= radios.length) {
        break;
      }

      const radio = radios[idx];
      const radioFiles = await typedQuery<FileEventItem>({
        TableName: TABLE_DEVICES,
        ExpressionAttributeNames: {
          '#RadioID': 'RadioID',
          '#StartTime': 'StartTime',
        },
        ExpressionAttributeValues: {
          ':RadioID': radio.RadioID,
          ':StartTime': startTime,
          ':EndTime': endTime,
        },
        KeyConditionExpression: '#RadioID = :RadioID AND #StartTime BETWEEN :StartTime AND :EndTime',
        Limit: 1000,
      });

      if (!radioFiles.Items?.length) {
        logger.log(`No new device recordings for ${radio.RadioID} (${radio.Count})`);
        continue;
      }
      logger.log(`Updating device recordings for ${radio.RadioID}: ${radioFiles.Items?.length} (${radio.Count})`);

      await typedUpdate<RadioObject>({
        TableName: TABLE_RADIOS,
        Key: {
          RadioID: radio.RadioID,
        },
        ExpressionAttributeNames: {
          '#InUse': 'InUse',
          '#Count': 'Count',
        },
        ExpressionAttributeValues: {
          ':InUse': 'Y',
          ':Count': radioFiles.Items?.length || 0,
          ':CountBase': 0,
        },
        UpdateExpression: 'SET #InUse = :InUse, #Count = if_not_exists(#Count, :CountBase) + :Count',
      });
    }
  };

  const runners = [];
  for (let i = 0; i < 100; i++) {
    runners.push(runner());
  }
  await Promise.all(runners);

  logger.log('Completed processDeviceRecordings');
}

async function processTalkgroupRecordings(
  allTalkgroups: FullTalkgroupObject[],
  startTime: number,
  endTime: number
) {
  logger.log('Started processTalkgroupRecordings');

  // Loop over all of the radio IDs
  const talkgroups = allTalkgroups.filter(v => v.InUse === 'Y' && (!v.Count || v.Count < 1000));
  let talkgroupIdx = 0;
  const runner = async () => {
    while (true) {
      const idx = talkgroupIdx++;
      if (idx >= talkgroups.length) {
        break;
      }

      const tg = talkgroups[idx];
      const tgFiles = await typedQuery<FullFileObject>({
        TableName: TABLE_FILE,
        IndexName: 'StartTimeTgIndex',
        ExpressionAttributeNames: {
          '#Talkgroup': 'Talkgroup',
          '#StartTime': 'StartTime',
        },
        ExpressionAttributeValues: {
          ':Talkgroup': tg.ID,
          ':StartTime': startTime,
          ':EndTime': endTime,
        },
        KeyConditionExpression: '#Talkgroup = :Talkgroup AND #StartTime BETWEEN :StartTime AND :EndTime',
        Limit: 1000,
      });

      if (!tgFiles.Items?.length) {
        logger.log(`No new talkgroup recordings for ${tg.ID} (${tg.Count})`);
        continue;
      }
      logger.log(`Updating talkgroup recordings for ${tg.ID}: ${tgFiles.Items?.length} (${tg.Count})`);

      await typedUpdate<FullTalkgroupObject>({
        TableName: TABLE_TALKGROUP,
        Key: {
          ID: tg.ID,
        },
        ExpressionAttributeNames: {
          '#InUse': 'InUse',
          '#Count': 'Count',
        },
        ExpressionAttributeValues: {
          ':InUse': 'Y',
          ':Count': tgFiles.Items?.length || 0,
          ':CountBase': 0,
        },
        UpdateExpression: 'SET #InUse = :InUse, #Count = if_not_exists(#Count, :CountBase) + :Count',
      });
    }
  };

  const runners = [];
  for (let i = 0; i < 100; i++) {
    runners.push(runner());
  }
  await Promise.all(runners);

  logger.log('Completed processTalkgroupRecordings');
}

export async function main() {
  const allRadioIds = await typedScan<RadioObject>({
    TableName: TABLE_RADIOS,
  });
  if (!allRadioIds.Items || allRadioIds.Items.length === 0) {
    return;
  }

  const allTalkgroups = await typedScan<FullTalkgroupObject>({
    TableName: TABLE_TALKGROUP,
  });
  if (!allTalkgroups.Items || allTalkgroups.Items.length === 0) {
    return;
  }

  const startTime = new Date(Date.now() - (24 * 60 * 60 * 1000));
  startTime.setUTCHours(0);
  startTime.setUTCMinutes(0);
  startTime.setUTCSeconds(0);
  startTime.setUTCMilliseconds(0);
  const endTime = new Date(startTime.getTime() + (24 * 60 * 60 * 1000));
  const queryDate = `${startTime.getUTCFullYear()}-${(startTime.getMonth() + 1).toString().padStart(2, '0')}` +
    `-${startTime.getUTCDate().toString()
      .padStart(2, '0')}-%`;

  await Promise.all([
    processDeviceEvents(allRadioIds.Items, queryDate)
      .catch(e => logger.error('processDeviceEvents', e)),
    processTalkgroupEvents(allTalkgroups.Items, queryDate)
      .catch(e => logger.error('processTalkgroupEvents', e)),
    processDeviceRecordings(
      allRadioIds.Items || [],
      startTime.getTime() / 1000,
      endTime.getTime() / 1000
    )
      .catch(e => logger.error('processDeviceRecordings', e)),
    processTalkgroupRecordings(
      allTalkgroups.Items,
      startTime.getTime() / 1000,
      endTime.getTime() / 1000
    )
      .catch(e => logger.error('processTalkgroupRecordings', e)),
  ]);
}
