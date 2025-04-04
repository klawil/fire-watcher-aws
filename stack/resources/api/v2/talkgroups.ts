import { getLogger } from '../../utils/logger';
import * as AWS from 'aws-sdk';
import { GetAllTalkgroupsApi } from '$/apiv2/talkgroups';
import { handleResourceApi, LambdaApiFunction, TABLE_TALKGROUP, DocumentQueryConfig, mergeDynamoQueriesDocClient } from './_base';

const logger = getLogger('talkgroups');

const GET: LambdaApiFunction<GetAllTalkgroupsApi> = async function (event) {
  logger.debug('GET', ...arguments);

  const queryStringParameters: GetAllTalkgroupsApi['query'] = event.queryStringParameters || {};
  const baseQueryConfig: AWS.DynamoDB.DocumentClient.QueryInput & Required<Pick<
    AWS.DynamoDB.DocumentClient.QueryInput,
    'ExpressionAttributeNames'
  >>= {
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

  const partitions: ('Y' | 'N')[] = [ 'Y' ];
  if (queryStringParameters.all === 'y') {
    partitions.push('N');
  }

  // Build the query configs
  const queryConfigs: DocumentQueryConfig[] = partitions.map(partition => ({
    ExpressionAttributeValues: {
      ':inUse': partition,
    },
  }));

  const data = await mergeDynamoQueriesDocClient<GetAllTalkgroupsApi['responses']['200']['talkgroups'][number]>(
    baseQueryConfig,
    queryConfigs,
    'Count',
  );

  return [ 200, {
    count: data.Items.length,
    loadedAll: !data.LastEvaluatedKeys.reduce((agg, key) => agg || key !== null, false),
    talkgroups: data.Items,
  } ];
}

export const main = handleResourceApi.bind(null, {
  GET,
});
