import {
  DocumentQueryConfig,
  LambdaApiFunction,
  handleResourceApi, mergeDynamoQueriesDocClient
} from './_base';

import { generateApi400Body } from '@/types/api/_shared';
import {
  FullTalkgroupObject, GetAllTalkgroupsApi, getAllTalkgroupsApiQueryValidator
} from '@/types/api/talkgroups';
import { TypedQueryInput } from '@/types/backend/dynamo';
import { TABLE_TALKGROUP } from '@/utils/backend/dynamoTyped';
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

  const baseQueryConfig: TypedQueryInput<FullTalkgroupObject> = {
    TableName: TABLE_TALKGROUP,
    IndexName: 'InUseIndex',
    ExpressionAttributeNames: {
      '#inUse': 'InUse',
      '#id': 'ID',
      '#name': 'Name',
      '#count': 'Count',
    },
    KeyConditionExpression: '#inUse = :inUse',
    ProjectionExpression: '#id,#name,#count,#inUse',
  };

  const partitions: ('Y' | 'N')[] = [ 'Y', ];
  if (query.all === 'y') {
    partitions.push('N');
  }

  // Build the query configs
  const queryConfigs: DocumentQueryConfig<FullTalkgroupObject>[] = partitions.map(partition => ({
    ExpressionAttributeValues: {
      ':inUse': partition,
    },
  }));

  const data = await mergeDynamoQueriesDocClient<GetAllTalkgroupsApi['responses']['200']['talkgroups'][number]>(
    baseQueryConfig,
    queryConfigs,
    'Count'
  );

  return [
    200,
    {
      count: data.Items.length,
      loadedAll: !data.LastEvaluatedKeys.reduce((agg, key) => agg || key !== null, false),
      talkgroups: data.Items,
    },
  ];
};

export const main = handleResourceApi.bind(null, {
  GET,
});
