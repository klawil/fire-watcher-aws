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
  FileEventItem,
  FullEventItem,
  GetRadioEventsApi, GetTalkgroupEventsApi,
  getEventsParamsValidator,
  getEventsQueryValidator
} from '@/types/api/events';
import { TypedQueryInput } from '@/types/backend/dynamo';
import {
  TABLE_DEVICES, TABLE_FILE,
  typedQuery
} from '@/utils/backend/dynamoTyped';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('resources/api/v2/eventsList');

const athena = new AthenaClient();

const MAX_RESULTS = 1500;

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
  const startTime = endTime - (28 * 24 * 60 * 60 * 1000);

  if (!query.queryId) {
    const padNum = (num: number) => num.toString().padStart(2, '0');

    // Start and end dates
    const startDateTime = new Date(startTime);
    const startDatetimeString = `${startDateTime.getUTCFullYear()}-${padNum(startDateTime.getMonth() + 1)}-` +
      `${padNum(startDateTime.getUTCDate())}-${padNum(startDateTime.getUTCHours())}`;
    const endDateTime = new Date(endTime);
    const endDatetimeString = `${endDateTime.getUTCFullYear()}-${padNum(endDateTime.getMonth() + 1)}-` +
      `${padNum(endDateTime.getUTCDate())}-${padNum(endDateTime.getUTCHours())}`;

    // Run the Athena query
    const QueryString = `SELECT *
        FROM "${process.env.GLUE_TABLE}"
        WHERE "${queryType}" = '${params.id}'
        AND "event" != 'call'
        AND "datetime" > '${startDatetimeString}'
        AND "datetime" <= '${endDatetimeString}'
        ORDER BY "timestamp" DESC`;
    const queryId = await athena.send(new StartQueryExecutionCommand({
      QueryString,
      WorkGroup: process.env.ATHENA_WORKGROUP,
      QueryExecutionContext: {
        Database: process.env.GLUE_DATABASE,
      },
      ResultReuseConfiguration: {
        ResultReuseByAgeConfiguration: {
          Enabled: true,
          MaxAgeInMinutes: 15,
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
  const athenaResults = results.ResultSet?.Rows?.slice(1)
    .map(r => r.Data?.map(c => c.VarCharValue) || [])
    .map(r => r.reduce((agg: { [key: string]: string | undefined | number }, v, i) => {
      agg[names[i] || 'UNK'] = v;
      if (names[i] === 'timestamp') {
        agg.timestamp = Number(agg.timestamp);
      }
      return agg as FullEventItem;
    }, {})) as FullEventItem[] || [];

  // Get the files
  const fileQueryConfig: TypedQueryInput<FileEventItem> & Required<Pick<
    TypedQueryInput<FileEventItem>,
    'ExpressionAttributeNames' | 'ExpressionAttributeValues'
  >> = {
    ScanIndexForward: false,
    TableName: TABLE_FILE,
    ExpressionAttributeNames: {
      '#StartTime': 'StartTime',
    },
    ExpressionAttributeValues: {
      ':StartTime': Math.round(startTime / 1000),
      ':EndTime': Math.round(endTime / 1000),
    },
  };
  if (queryType === 'talkgroup') {
    fileQueryConfig.ExpressionAttributeNames['#Talkgroup'] = 'Talkgroup';
    fileQueryConfig.ExpressionAttributeValues[':Talkgroup'] = params.id;
    fileQueryConfig.IndexName = 'StartTimeTgIndex';
    fileQueryConfig.KeyConditionExpression = '#Talkgroup = :Talkgroup AND #StartTime BETWEEN :StartTime AND :EndTime';
  } else {
    fileQueryConfig.TableName = TABLE_DEVICES;
    fileQueryConfig.ExpressionAttributeNames['#RadioID'] = 'RadioID';
    fileQueryConfig.ExpressionAttributeValues[':RadioID'] = params.id.toString();
    fileQueryConfig.KeyConditionExpression = '#RadioID = :RadioID AND #StartTime BETWEEN :StartTime AND :EndTime';
  }
  const filesQueryResult = await typedQuery<FileEventItem>(fileQueryConfig);
  const fileResults = filesQueryResult.Items || [];

  let endResults = [
    ...athenaResults,
    ...fileResults,
  ].sort((a, b) => {
    const aVal = 'StartTime' in a
      ? a.StartTime * 1000
      : a.timestamp;
    const bVal = 'StartTime' in b
      ? b.StartTime * 1000
      : b.timestamp;

    return aVal >= bVal ? -1 : 1;
  });

  let firstEvent = startTime;
  const athenaFirst = athenaResults.length
    ? athenaResults[athenaResults.length - 1].timestamp
    : 0;
  const filesFirst = fileResults.length
    ? fileResults[fileResults.length - 1].StartTime * 1000
    : 0;
  if (endResults.length >= MAX_RESULTS) {
    const firstEventItem = endResults[MAX_RESULTS];
    firstEvent = 'timestamp' in firstEventItem
      ? firstEventItem.timestamp
      : firstEventItem.StartTime * 1000;
  } else if (athenaResults.length && fileResults.length) {
    firstEvent = athenaFirst < filesFirst
      ? athenaFirst
      : filesFirst;
  } else if (athenaResults.length) {
    firstEvent = athenaFirst;
  } else if (fileResults.length) {
    firstEvent = filesFirst;
  }

  // Round first event to the nearest hour
  firstEvent = Math.ceil(firstEvent / (1000 * 60 * 60)) * 1000 * 60 * 60;

  // Filter out older events
  endResults = endResults.filter(v => {
    if ('StartTime' in v) {
      return v.StartTime * 1000 >= firstEvent;
    }

    return v.timestamp >= firstEvent;
  });

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
