import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';

import { generateApi400Body } from '@/types/api/_shared';
import {
  FullTalkgroupObject, GetAllTalkgroupsApi, getAllTalkgroupsApiQueryValidator
} from '@/types/api/talkgroups';
import {
  TABLE_TALKGROUP, typedFullQuery, typedFullScan
} from '@/utils/backend/dynamoTyped';
import { validateObject } from '@/utils/backend/validation';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('talkgroups');

const GET: LambdaApiFunction<GetAllTalkgroupsApi> = async function (event) {
  logger.debug('GET', ...arguments);

  const [
    query,
    queryErrors,
  ] = validateObject<GetAllTalkgroupsApi['query']>(
    event.queryStringParameters || {},
    getAllTalkgroupsApiQueryValidator
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

  let data;
  if (query.all !== 'y') {
    data = await typedFullQuery<FullTalkgroupObject>({
      TableName: TABLE_TALKGROUP,
      IndexName: 'InUseIndex',
      ExpressionAttributeNames: {
        '#InUse': 'InUse',
        '#ID': 'ID',
        '#Name': 'Name',
      },
      ExpressionAttributeValues: {
        ':InUse': 'Y',
      },
      KeyConditionExpression: '#InUse = :InUse',
      ProjectionExpression: '#ID,#Name',
    });
  } else {
    data = await typedFullScan<FullTalkgroupObject>({
      TableName: TABLE_TALKGROUP,
      ExpressionAttributeNames: {
        '#InUse': 'InUse',
        '#HasEvents': 'HasEvents',
        '#ID': 'ID',
        '#Name': 'Name',
        '#Count': 'Count',
        '#EventsCount': 'EventsCount',
      },
      ExpressionAttributeValues: {
        ':InUse': 'Y',
        ':HasEvents': 'Y',
      },
      FilterExpression: '#InUse = :InUse OR #HasEvents = :HasEvents',
      ProjectionExpression: '#ID,#Name,#Count,#EventsCount',
    });
  }

  return [
    200,
    {
      count: data.Items.length,
      loadedAll: data.LastEvaluatedKey === null,
      runs: data.Runs,
      talkgroups: data.Items,
    },
  ];
};

export const main = handleResourceApi.bind(null, {
  GET,
});
