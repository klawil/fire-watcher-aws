import {
  AthenaClient, GetQueryExecutionCommand, GetQueryResultsCommand, StartQueryExecutionCommand
} from '@aws-sdk/client-athena';

import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';
import {
  validateRequest
} from './_utils';

import {
  api404Body, api500Body, generateApi400Body
} from '@/types/api/_shared';
import {
  EventItem,
  GetRadioEventsApi, GetTalkgroupEventsApi,
  getEventsParamsValidator,
  getEventsQueryValidator
} from '@/types/api/events';
import {
  ATHENA_WORKGROUP, GLUE_DATABASE, GLUE_TABLE_V2
} from '@/types/backend/environment';
import {
  dateTimeToPartition, datetimePartitionToTimestamp
} from '@/utils/common/dateAndFile';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('resources/api/v2/eventsList');

const athena = new AthenaClient();

const MAX_RESULTS = 1500;
const minDatetime = 1735689600000; // 2025-01-01 00:00 UTC

const GET: LambdaApiFunction<GetRadioEventsApi | GetTalkgroupEventsApi> = async function (event) {
  logger.trace('GET', ...arguments);

  // Validate the path is talkgroup or radio
  if (![
    'talkgroup',
    'radioid',
  ].includes(event.pathParameters?.type || '')) {
    return [
      404,
      api404Body,
    ];
  }
  const queryType = event.pathParameters?.type as 'talkgroup' | 'radioid';

  // Validate the ID
  const {
    params,
    query,
    validationErrors,
  } = validateRequest<GetTalkgroupEventsApi>({
    paramsRaw: event.pathParameters,
    paramsValidator: getEventsParamsValidator,
    queryRaw: event.queryStringParameters || {},
    queryValidator: getEventsQueryValidator,
  });
  if (
    params === null ||
    query === null ||
    validationErrors.length > 0
  ) {
    return [
      400,
      generateApi400Body(validationErrors),
    ];
  }

  let endTime: number = Math.ceil(Date.now() / (60 * 60 * 1000)) * 1000 * 60 * 60;
  if (typeof query.endTime !== 'undefined') {
    endTime = query.endTime;
  }
  let startTime = endTime - (28 * 24 * 60 * 60 * 1000);
  if (startTime < minDatetime) {
    startTime = minDatetime;
  }

  if (!query.queryId) {
    // Build the WHERE clause based on query type
    // For radioid: filter by source
    // For talkgroup: filter by talkgroup
    let whereClause = '';
    if (queryType === 'talkgroup') {
      whereClause = `"talkgroup" = ${params.id}`;
    } else {
      // For radioid, filter by source
      whereClause = `"source" = ${params.id}`;
    }

    // Run the Athena query
    const QueryString = `SELECT *
        FROM "${GLUE_TABLE_V2()}"
        WHERE ${whereClause}
        AND "datetime" < '${dateTimeToPartition(endTime, true)}'
        AND "datetime" >= '${dateTimeToPartition(startTime)}'
        ORDER BY "datetime" DESC`;
    const queryId = await athena.send(new StartQueryExecutionCommand({
      QueryString,
      WorkGroup: ATHENA_WORKGROUP(),
      QueryExecutionContext: {
        Database: GLUE_DATABASE(),
      },
      ResultReuseConfiguration: {
        ResultReuseByAgeConfiguration: {
          Enabled: true,
          MaxAgeInMinutes: 60,
        },
      },
    }));
    if (!queryId.QueryExecutionId) {
      logger.error('Failed to produce query execution ID:', queryId);
      return [
        500,
        api500Body,
      ];
    }

    return [
      200,
      {
        queryId: queryId.QueryExecutionId,
        endTime,
      },
    ];
  }

  // Look for the result
  const queryStatus = await athena.send(new GetQueryExecutionCommand({
    QueryExecutionId: query.queryId,
  }));
  const queryState = queryStatus.QueryExecution?.Status?.State || 'UNKNOWN';

  // Handle failed states
  if ([
    'CANCELLED',
    'FAILED',
  ].includes(queryState)) {
    logger.error(`Query ID ${query.queryId} in state ${queryState}`);
    return [
      500,
      api500Body,
    ];
  }

  // Handle in progress states
  if ([
    'QUEUED',
    'RUNNING',
    'UNKNOWN',
  ].includes(queryState)) {
    return [
      200,
      {
        status: queryState,
      },
    ];
  }

  // Get the results
  const results = await athena.send(new GetQueryResultsCommand({
    QueryExecutionId: query.queryId,
  }));
  if (!results.ResultSet?.Rows) {
    logger.error(`No results returned from query ID ${query.queryId}`);
  }

  // Parse the results
  const names = results.ResultSet?.Rows?.[0].Data?.map(c => c.VarCharValue) || [];
  const events = results.ResultSet?.Rows?.slice(1)
    .map(r => r.Data?.map(c => c.VarCharValue) || [])
    .map(r => {
      const parsed: { [key: string]: string | number | boolean } = {};
      r.forEach((v, i) => {
        if (!v) {
          return;
        }
        const key = names[i];
        if (!key) {
          return;
        }

        if ([
          'opcode',
          'priority',
          'freq',
          'source',
          'talkgroup',
          'tdma_slot',
        ].includes(key)) {
          parsed[key] = parseInt(v);
        } else if ([
          'duplex',
          'mode',
          'phase2_tdma',
          'emergency',
          'encrypted',
        ].includes(key)) {
          parsed[key] = v.toLowerCase() === 'true' || v === '1';
        } else {
          parsed[key] = v;
        }
      });

      return parsed as unknown as EventItem;
    }) as EventItem[] || [];

  let firstEvent = startTime;
  if (events.length >= MAX_RESULTS) {
    const firstEventItem = events[MAX_RESULTS] || events[events.length - 1];
    firstEvent = datetimePartitionToTimestamp(firstEventItem.datetime);
  } else if (events.length > 0) {
    firstEvent = datetimePartitionToTimestamp(events[events.length - 1].datetime);
  }

  // Filter out older events
  const endResults = events.filter(v => datetimePartitionToTimestamp(v.datetime) >= firstEvent);

  return [
    200,
    {
      count: endResults.length,
      events: endResults,
      startTime: firstEvent,
      endTime,
    },
  ];
};

export const main = handleResourceApi.bind(null, {
  GET,
});
