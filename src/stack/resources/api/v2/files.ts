import { getLogger } from '../../utils/logger';
import { FullFileObject, GetAllFilesApi } from '@/common/apiv2/files';
import { handleResourceApi, LambdaApiFunction, TABLE_FILE, DocumentQueryConfig, mergeDynamoQueriesDocClient } from './_base';

const logger = getLogger('files');

const defaultListLimit = 100;
const afterAddedIndexNames: {
  [key: string]: undefined | string;
} = {
  StartTimeEmergIndex: 'AddedIndex',
  StartTimeTgIndex: undefined,
};

const GET: LambdaApiFunction<GetAllFilesApi> = async function (event) {
  logger.debug('GET', ...arguments);

  // @TODO - implement the validator
  const queryStringParameters: GetAllFilesApi['query'] = event.queryStringParameters || {};
  const baseQueryConfig: AWS.DynamoDB.DocumentClient.QueryInput & Required<Pick<
    AWS.DynamoDB.DocumentClient.QueryInput,
    'ExpressionAttributeNames'
  >>= {
    ScanIndexForward: false,
    TableName: TABLE_FILE,
    ExpressionAttributeNames: {},
    Limit: defaultListLimit,
  };
  const queryConfigs: DocumentQueryConfig[] = [];

  // Generate the base configs using an index. This can be a talkgroup index or emergency index
  if (typeof queryStringParameters.tg !== 'undefined') {
    baseQueryConfig.ExpressionAttributeNames = {
      '#tg': 'Talkgroup',
    };
    baseQueryConfig.IndexName = 'StartTimeTgIndex';
    baseQueryConfig.KeyConditionExpression = '#tg = :tg';
    queryStringParameters.tg.split('|')
      .forEach(tg => queryConfigs.push({
        ExpressionAttributeValues: {
          ':tg': Number(tg),
        },
      }));
  } else {
    let emergencyValues = [ 0, 1 ];
    if (typeof queryStringParameters.emerg !== 'undefined') {
      emergencyValues = queryStringParameters.emerg === 'y'
        ? [ 1 ]
        : [ 0 ];
    }

    baseQueryConfig.ExpressionAttributeNames = {
      '#emerg': 'Emergency',
    };
    baseQueryConfig.IndexName = 'StartTimeEmergIndex';
    baseQueryConfig.KeyConditionExpression = '#emerg = :emerg';
    emergencyValues.forEach(emerg => queryConfigs.push({
      ExpressionAttributeValues: {
        ':emerg': emerg,
      },
    }));
  }

  if (
    typeof queryStringParameters.before !== 'undefined' &&
    !isNaN(Number(queryStringParameters.before))
  ) {
    // Add a filter for files recorded before a certain time
    const before = Number(queryStringParameters.before);
    baseQueryConfig.ExpressionAttributeNames['#st'] = 'StartTime';
    baseQueryConfig.KeyConditionExpression += ' AND #st < :st';

    queryConfigs.forEach(queryConfig => {
      queryConfig.ExpressionAttributeValues[':st'] = before;
    });
  } else if (
		typeof queryStringParameters.after !== 'undefined' &&
		!isNaN(Number(queryStringParameters.after))
  ) {
    // Add a filter for files recorded after a certain time
    const after = Number(queryStringParameters.after);
    baseQueryConfig.ScanIndexForward = true;
    baseQueryConfig.ExpressionAttributeNames['#st'] = 'StartTime';
    baseQueryConfig.KeyConditionExpression += ' AND #st > :st';

    queryConfigs.forEach(queryConfig => {
      queryConfig.ExpressionAttributeValues[':st'] = after;
    });
  } else if (
		typeof queryStringParameters.afterAdded !== 'undefined' &&
		!isNaN(Number(queryStringParameters.afterAdded))
  ) {
    // Add a filter for files ADDED after a certain time
    const afterAdded = Number(queryStringParameters.afterAdded);
    baseQueryConfig.ScanIndexForward = true;
    baseQueryConfig.ExpressionAttributeNames['#added'] = 'Added';
    baseQueryConfig.KeyConditionExpression += ' AND #added > :added';

    const newIndex = afterAddedIndexNames[baseQueryConfig.IndexName || ''];
    if (typeof newIndex === 'undefined')
      delete baseQueryConfig.IndexName;
    else
      baseQueryConfig.IndexName = newIndex;

    queryConfigs.forEach(queryConfig => {
      queryConfig.ExpressionAttributeValues[':added'] = afterAdded;
    });
  }

  // Fetch the data
  const data = await mergeDynamoQueriesDocClient<FullFileObject>(
    baseQueryConfig,
    queryConfigs,
    'StartTime',
    'Added',
  );

  return [ 200, {
    before: data.MinSortKey,
    after: data.MaxSortKey,
    afterAdded: data.MaxAfterKey,
    files: data.Items,
  } ];
}

export const main = handleResourceApi.bind(null, {
  GET,
});
