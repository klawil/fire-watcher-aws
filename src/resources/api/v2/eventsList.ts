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
  // api401Body,
  api404Body, api500Body, generateApi400Body
} from '@/types/api/_shared';
import {
  FileEventItem,
  FullEventItem,
  GetRadioEventsApi, GetTalkgroupEventsApi,
  getEventsParamsValidator
} from '@/types/api/events';
import { TypedQueryInput } from '@/types/backend/dynamo';
import {
  TABLE_DEVICES, TABLE_FILE,
  typedQuery
} from '@/utils/backend/dynamoTyped';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('resources/api/v2/eventsList');

const athena = new AthenaClient();

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
    validationErrors,
  } = validateRequest<GetTalkgroupEventsApi>({
    paramsRaw: event.pathParameters,
    paramsValidator: getEventsParamsValidator,
  });
  if (
    params === null ||
    validationErrors.length > 0
  ) {
    return [
      400,
      generateApi400Body(validationErrors),
    ];
  }

  // Run the Athena query
  const startDateTime = new Date(Date.now() - (28 * 24 * 60 * 60 * 1000));
  const padNum = (num: number) => num.toString().padStart(2, '0');
  const startDatetimeString = `${startDateTime.getUTCFullYear()}-${padNum(startDateTime.getMonth() + 1)}-` +
    `${padNum(startDateTime.getUTCDate())}-${padNum(startDateTime.getUTCHours())}`;
  const QueryString = `SELECT *
      FROM "${process.env.GLUE_TABLE}"
      WHERE "${queryType}" = '${params.id}'
      AND "event" != 'call'
      AND "datetime" >= '${startDatetimeString}'
      ORDER BY "timestamp" DESC`;
  const queryResultsPromise: Promise<{
    events: FullEventItem[];
    queryId: string | null;
    success: true;
  } | {
    success: false;
  }> = (async () => {
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
      return {
        success: false,
      };
    }

    // Wait for the result
    const statusRequest = new GetQueryExecutionCommand({
      QueryExecutionId: queryId.QueryExecutionId,
    });
    let isRunning = true;
    let queryState: 'CANCELLED' | 'FAILED' | 'SUCCEEDED' = 'FAILED';
    while (isRunning) {
      const queryStatus = await athena.send(statusRequest);
      if (
        !queryStatus.QueryExecution?.Status?.State ||
      queryStatus.QueryExecution.Status.State === 'RUNNING' ||
      queryStatus.QueryExecution.Status.State === 'QUEUED'
      ) {
        await new Promise(res => setTimeout(res, 100));
        continue;
      }

      // Handle the result
      queryState = queryStatus.QueryExecution.Status.State;
      isRunning = false;
    }

    // Handle failed states
    if ([
      'CANCELLED',
      'FAILED',
    ].includes(queryState)) {
      logger.error(`Query ID ${queryId.QueryExecutionId} in state ${queryState}`);
      return {
        success: false,
      };
    }

    // Get the results
    const results = await athena.send(new GetQueryResultsCommand({
      QueryExecutionId: queryId.QueryExecutionId,
      MaxResults: 500,
    }));
    if (!results.ResultSet?.Rows) {
      logger.error(`No results returned from query ID ${queryId.QueryExecutionId}`);
      return {
        success: false,
      };
    }

    // Parse the results
    const names = results.ResultSet.Rows[0].Data?.map(c => c.VarCharValue) || [];
    return {
      events: results.ResultSet.Rows.slice(1)
        .map(r => r.Data?.map(c => c.VarCharValue) || [])
        .map(r => r.reduce((agg: { [key: string]: string | undefined | number }, v, i) => {
          agg[names[i] || 'UNK'] = v;
          if (names[i] === 'timestamp') {
            agg.timestamp = Number(agg.timestamp);
          }
          return agg as FullEventItem;
        }, {})) as FullEventItem[],
      queryId: queryId.QueryExecutionId || null,
      success: true,
    };
  })();

  // Get the files
  const fileQueryConfig: TypedQueryInput<FileEventItem> = {
    ScanIndexForward: false,
    TableName: TABLE_FILE,
    Limit: 500,
  };
  if (queryType === 'talkgroup') {
    fileQueryConfig.ExpressionAttributeNames = {
      '#Talkgroup': 'Talkgroup',
    };
    fileQueryConfig.ExpressionAttributeValues = {
      ':Talkgroup': params.id,
    };
    fileQueryConfig.IndexName = 'StartTimeTgIndex';
    fileQueryConfig.KeyConditionExpression = '#Talkgroup = :Talkgroup';
  } else {
    fileQueryConfig.TableName = TABLE_DEVICES;
    fileQueryConfig.ExpressionAttributeNames = {
      '#RadioID': 'RadioID',
    };
    fileQueryConfig.ExpressionAttributeValues = {
      ':RadioID': params.id.toString(),
    };
    fileQueryConfig.KeyConditionExpression = '#RadioID = :RadioID';
  }
  const filesResult = await typedQuery(fileQueryConfig);

  const eventsResult = await queryResultsPromise;
  if (!eventsResult.success) {
    logger.error('Athena events failed');
    return [
      500,
      api500Body,
    ];
  }

  return [
    200,
    {
      events: [
        ...eventsResult.events,
        ...filesResult.Items || [],
      ],
      nextKey: null,
      queryId: eventsResult.queryId,
    },
  ];
};

export const main = handleResourceApi.bind(null, {
  GET,
});
