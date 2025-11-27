import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';

import {
  api401Body, generateApi400Body
} from '@/types/api/_shared';
import { FullFileObject } from '@/types/api/files';
import {
  GetPagesApi, getPagesApiQueryValidator
} from '@/types/api/pages';
import { TypedQueryInput } from '@/types/backend/dynamo';
import {
  TABLE_FILE, typedQuery
} from '@/utils/backend/dynamoTyped';
import { validateObject } from '@/utils/backend/validation';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('resources/api/v2/pages');

const defaultListLimit = 100;

const GET: LambdaApiFunction<GetPagesApi> = async function (event, user, userPerms) {
  logger.trace('GET', ...arguments);

  // Validate the user
  if (
    user === null ||
    !userPerms.isUser
  ) {
    return [
      401,
      api401Body,
    ];
  }

  // Validate the query
  const [
    query,
    queryErrors,
  ] = validateObject<GetPagesApi['query']>(
    event.multiValueQueryStringParameters || {},
    getPagesApiQueryValidator,
    true
  );
  if (
    query === null ||
    queryErrors.length > 0
  ) {
    return [
      400,
      generateApi400Body(queryErrors),
    ];
  }

  const queryConfig: TypedQueryInput<FullFileObject> & Required<Pick<
    TypedQueryInput<FullFileObject>,
    'ExpressionAttributeNames' | 'ExpressionAttributeValues' | 'KeyConditionExpression'
  >> = {
    ScanIndexForward: false,
    TableName: TABLE_FILE,
    Limit: defaultListLimit,
    IndexName: 'ToneIndex',
    ExpressionAttributeNames: {
      '#ToneIndex': 'ToneIndex',
    },
    ExpressionAttributeValues: {
      ':ToneIndex': 'y',
    },
    KeyConditionExpression: '#ToneIndex = :ToneIndex',
  };
  if (typeof query.tg !== 'undefined') {
    queryConfig.ExpressionAttributeNames['#Talkgroup'] = 'Talkgroup';
    queryConfig.FilterExpression = query.tg.map((tg, idx) => {
      queryConfig.ExpressionAttributeValues[`:Talkgroup${idx}`] = tg;
      return `#Talkgroup = :Talkgroup${idx}`;
    }).join(' OR ');
  }
  if (typeof query.before !== 'undefined') {
    queryConfig.ExpressionAttributeNames['#StartTime'] = 'StartTime';
    queryConfig.ExpressionAttributeValues[':StartTime'] = query.before;
    queryConfig.KeyConditionExpression += ' AND #StartTime < :StartTime';
  }

  const queryResults = await typedQuery<FullFileObject>(queryConfig);
  if (!queryResults.Items?.length) {
    return [
      200,
      {
        before: null,
        files: [],
        query: queryResults,
      },
    ];
  }

  let before: number | null = null;
  queryResults.Items.forEach(f => {
    if (
      f.StartTime &&
      (
        before === null ||
        f.StartTime < before
      )
    ) {
      before = f.StartTime;
    }
  });

  return [
    200,
    {
      before,
      files: queryResults.Items,
      query: queryResults,
    },
  ];
};

export const main = handleResourceApi.bind(null, {
  GET,
});
