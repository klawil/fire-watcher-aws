import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';
import {
  DocumentQueryConfig,
  mergeDynamoQueriesDocClient
} from './_utils';

import { generateApi400Body } from '@/types/api/_shared';
import {
  FullFileObject, GetAllFilesApi, getAllFilesApiQueryValidator
} from '@/types/api/files';
import { TypedQueryInput } from '@/types/backend/dynamo';
import { TABLE_FILE } from '@/utils/backend/dynamoTyped';
import { validateObject } from '@/utils/backend/validation';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('files');

const defaultListLimit = 100;
const afterAddedIndexNames: {
  [key: string]: undefined | string;
} = {
  StartTimeEmergIndex: 'AddedIndex',
  StartTimeTgIndex: undefined,
  ToneIndex: undefined,
};

const GET: LambdaApiFunction<GetAllFilesApi> = async function (event) {
  logger.debug('GET', ...arguments);

  const [
    query,
    queryErrors,
  ] = validateObject<GetAllFilesApi['query']>(
    event.multiValueQueryStringParameters || {},
    getAllFilesApiQueryValidator,
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

  const baseQueryConfig: TypedQueryInput<FullFileObject> = {
    ScanIndexForward: false,
    TableName: TABLE_FILE,
    Limit: defaultListLimit,
  };
  const queryConfigs: DocumentQueryConfig<FullFileObject>[] = [];

  // Generate the base configs using an index. This can be a talkgroup index or emergency index
  if (typeof query.tg !== 'undefined') {
    baseQueryConfig.ExpressionAttributeNames = {
      '#talkgroup': 'Talkgroup',
    };
    baseQueryConfig.IndexName = 'StartTimeTgIndex';
    baseQueryConfig.KeyConditionExpression = '#talkgroup = :talkgroup';
    query.tg
      .forEach(tg => queryConfigs.push({
        ExpressionAttributeValues: {
          ':talkgroup': Number(tg),
        },
      }));
  } else if (typeof query.tone !== 'undefined') {
    baseQueryConfig.ExpressionAttributeNames = {
      '#ToneIndex': 'ToneIndex',
    };
    baseQueryConfig.IndexName = 'ToneIndex';
    baseQueryConfig.KeyConditionExpression = '#ToneIndex = :ToneIndex';
    queryConfigs.push({
      ExpressionAttributeValues: {
        ':ToneIndex': query.tone,
      },
    });
  } else if (typeof query.radioId !== 'undefined') {
    baseQueryConfig.TableName = process.env.TABLE_DEVICES;
    baseQueryConfig.ExpressionAttributeNames = {
      '#RadioID': 'RadioID',
    };
    baseQueryConfig.KeyConditionExpression = '#RadioID = :RadioID';
    queryConfigs.push({
      ExpressionAttributeValues: {
        ':RadioID': query.radioId,
      },
    });
  } else {
    let emergencyValues = [
      0,
      1,
    ];
    if (typeof query.emerg !== 'undefined') {
      emergencyValues = query.emerg === 'y'
        ? [ 1, ]
        : [ 0, ];
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

  if (typeof query.before !== 'undefined') {
    // Add a filter for files recorded before a certain time
    baseQueryConfig.ExpressionAttributeNames['#st'] = 'StartTime';
    baseQueryConfig.KeyConditionExpression += ' AND #st < :st';

    queryConfigs.forEach(queryConfig => {
      queryConfig.ExpressionAttributeValues[':st'] = query.before;
    });
  } else if (typeof query.after !== 'undefined') {
    // Add a filter for files recorded after a certain time
    baseQueryConfig.ScanIndexForward = true;
    baseQueryConfig.ExpressionAttributeNames['#st'] = 'StartTime';
    baseQueryConfig.KeyConditionExpression += ' AND #st > :st';

    queryConfigs.forEach(queryConfig => {
      queryConfig.ExpressionAttributeValues[':st'] = query.after;
    });
  } else if (typeof query.afterAdded !== 'undefined') {
    // Add a filter for files ADDED after a certain time
    baseQueryConfig.ScanIndexForward = true;
    baseQueryConfig.ExpressionAttributeNames['#added'] = 'Added';
    baseQueryConfig.KeyConditionExpression += ' AND #added > :added';

    const newIndex = afterAddedIndexNames[baseQueryConfig.IndexName || ''];
    if (typeof newIndex === 'undefined') {
      delete baseQueryConfig.IndexName;
    } else {
      baseQueryConfig.IndexName = newIndex;
    }

    queryConfigs.forEach(queryConfig => {
      queryConfig.ExpressionAttributeValues[':added'] = query.afterAdded;
    });
  }

  // Fetch the data
  const data = await mergeDynamoQueriesDocClient<FullFileObject>(
    baseQueryConfig,
    queryConfigs,
    'StartTime',
    'Added'
  );

  return [
    200,
    {
      before: data.MinSortKey,
      after: data.MaxSortKey,
      afterAdded: data.MaxAfterKey,
      files: data.Items,
    },
  ];
};

export const main = handleResourceApi.bind(null, {
  GET,
});
