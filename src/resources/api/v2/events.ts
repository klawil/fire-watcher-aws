import {
  AthenaClient, GetQueryExecutionCommand, GetQueryResultsCommand, StartQueryExecutionCommand
} from '@aws-sdk/client-athena';
import {
  FirehoseClient, PutRecordBatchCommand
} from '@aws-sdk/client-firehose';

import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';

import {
  api200Body, api401Body, api500Body, generateApi400Body
} from '@/types/api/_shared';
import {
  AddEventsApi,
  EventQueryResultRow,
  QueryEventsApi, eventItemValidator,
  queryEventsQueryValidator
} from '@/types/api/events';
import { validateObject } from '@/utils/backend/validation';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('resources/api/v2/events');
const firehose = new FirehoseClient();

const FIREHOSE_NAME = process.env.FIREHOSE_NAME;

const queryTimeframes = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 28 * 24 * 60 * 60 * 1000,
} as const;

const padNum = (num: number) => num.toString().padStart(2, '0');
const dateToQueryDate = (date: Date) => `${date.getUTCFullYear()}-${padNum(date.getMonth() + 1)}-` +
  `${padNum(date.getUTCDate())}-${padNum(date.getUTCHours())}`;

const GET: LambdaApiFunction<QueryEventsApi> = async function (event, user, userPerms) {
  logger.trace('GET', ...arguments);
  const athena = new AthenaClient();

  // Authorize the user
  if (user === null || !userPerms.isUser) {
    return [
      401,
      api401Body,
    ];
  }

  // Validate the request
  const [
    query,
    validationErrors,
  ] = validateObject<QueryEventsApi['query']>(
    event.multiValueQueryStringParameters || {},
    queryEventsQueryValidator,
    true
  );
  if (query !== null && typeof query.groupBy === 'undefined' && typeof query.queryId === 'undefined') {
    validationErrors.push('Must provide either groupBy or queryId');
  }
  if (
    query === null ||
    validationErrors.length > 0
  ) {
    return [
      400,
      generateApi400Body(validationErrors),
    ];
  }

  if (typeof query.groupBy !== 'undefined') {
    // Build the query time
    const timeframe = query.timeframe || 'month';
    const endTime = new Date(Date.now() - (24 * 60 * 60 * 1000));
    endTime.setUTCHours(0);
    endTime.setUTCMinutes(0);
    endTime.setUTCSeconds(0);
    endTime.setUTCMilliseconds(0);
    const startTime = new Date(endTime.getTime() - queryTimeframes[timeframe]);

    const queryString = `SELECT ${query.groupBy.map(v => `"${v}"`).join(', ')}, COUNT(*) as num
      FROM "${process.env.GLUE_TABLE}"
      WHERE "datetime" >= '${dateToQueryDate(startTime)}' AND
        "datetime" < '${dateToQueryDate(endTime)}'` +
        (query.events
          ? `AND
        "event" IN (${query.events.map(e => `'${e}'`).join(',')})`
          : '') +
      `GROUP BY ${query.groupBy.map(v => `"${v}"`).join(', ')}`;
    const queryId = await athena.send(new StartQueryExecutionCommand({
      QueryString: queryString,
      WorkGroup: process.env.ATHENA_WORKGROUP,
      QueryExecutionContext: {
        Database: process.env.GLUE_DATABASE,
      },
      ResultReuseConfiguration: {
        ResultReuseByAgeConfiguration: {
          Enabled: true,
          MaxAgeInMinutes: 60,
        },
      },
    }));

    if (!queryId.QueryExecutionId) {
      logger.error('Failed to produce query execution ID:', queryId, queryString);
      return [
        500,
        api500Body,
      ];
    }
    return [
      200,
      {
        queryId: queryId.QueryExecutionId,
        startTime: startTime.getTime(),
        endTime: endTime.getTime(),
      },
    ];
  }

  if (typeof query.queryId === 'undefined') {
    return [
      500,
      api500Body,
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
  let nextToken: string | undefined;
  const results = await athena.send(new GetQueryResultsCommand({
    QueryExecutionId: query.queryId,
  }));
  if (!results.ResultSet?.Rows) {
    logger.error(`No results returned from query ID ${query.queryId}`);
  }

  // Parse the results
  const names = results.ResultSet?.Rows?.[0].Data?.map(c => c.VarCharValue) || [];
  const rows: EventQueryResultRow[] = results.ResultSet?.Rows?.slice(1)
    .map(r => r.Data?.map(c => c.VarCharValue) || [])
    .map(r => r.reduce((agg: { [key: string]: string | undefined | number }, v, i) => {
      agg[names[i] || 'UNK'] = v;
      if (names[i] === 'num') {
        agg.num = Number(agg.num);
      }
      return agg as EventQueryResultRow;
    }, {})) as EventQueryResultRow[] || [];
  nextToken = results.NextToken;
  while (nextToken) {
    const results = await athena.send(new GetQueryResultsCommand({
      QueryExecutionId: query.queryId,
      NextToken: nextToken,
    }));
    if (!results.ResultSet?.Rows) {
      logger.error(`No results returned from query ID ${query.queryId}`);
    }
    const athenaResults = results.ResultSet?.Rows?.slice(1)
      .map(r => r.Data?.map(c => c.VarCharValue) || [])
      .map(r => r.reduce((agg: { [key: string]: string | undefined | number }, v, i) => {
        agg[names[i] || 'UNK'] = v;
        if (names[i] === 'num') {
          agg.num = Number(agg.num);
        }
        return agg as EventQueryResultRow;
      }, {})) as EventQueryResultRow[] || [];
    rows.push(...athenaResults);
    nextToken = results.NextToken;
  }

  return [
    200,
    {
      count: rows.length,
      rows,
    },
  ];
};

const POST: LambdaApiFunction<AddEventsApi> = async function (event) {
  logger.trace('POST', ...arguments);
  const eventTime = Date.now();

  // Parse the body
  const body = JSON.parse(event.body || '');
  if (
    !body ||
    !Array.isArray(body)
  ) {
    return [
      400,
      generateApi400Body([]),
    ];
  }

  // Get the valid items from the body
  const validItems: AddEventsApi['body'] = [];
  const allItemErrors: string[] = [];
  body.forEach((item, idx) => {
    const [
      parsedItem,
      itemErrors,
    ] = validateObject(item, eventItemValidator);
    if (itemErrors.length > 0) {
      allItemErrors.push(...itemErrors.map(v => `${idx}-${v}`));
    } else if (!parsedItem) {
      allItemErrors.push(`${idx}-null`);
    } else {
      validItems.push(parsedItem);
    }
  });

  // Send the valid items to the firehose
  if (validItems.length > 0) {
    const encoder = new TextEncoder();
    await firehose.send(new PutRecordBatchCommand({
      DeliveryStreamName: FIREHOSE_NAME,
      Records: validItems.map(item => {
        const timestamp = typeof item.timestamp !== 'undefined'
          ? item.timestamp
          : eventTime;

        const dateTime = new Date(timestamp);
        const datePartition = `${dateTime.getUTCFullYear()}-` +
          `${(dateTime.getUTCMonth() + 1).toString().padStart(2, '0')}-` +
          `${dateTime.getUTCDate().toString()
            .padStart(2, '0')}-` +
          `${dateTime.getUTCHours().toString()
            .padStart(2, '0')}`;

        return {
          Data: encoder.encode(JSON.stringify({
            ...item,
            timestamp,
            datePartition,
          })),
        };
      }),
    }));
  }

  // Return either the errors or a 200
  if (allItemErrors.length > 0) {
    return [
      400,
      generateApi400Body(allItemErrors),
    ];
  }
  return [
    200,
    api200Body,
  ];
};

export const main = handleResourceApi.bind(null, {
  GET,
  POST,
});
