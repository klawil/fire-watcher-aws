import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';

import { api401Body } from '@/types/api/_shared';
import {
  GetAllRadiosApi, RadioObject
} from '@/types/api/radios';
import {
  TABLE_RADIOS, typedFullScan
} from '@/utils/backend/dynamoTyped';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('radios');

const GET: LambdaApiFunction<GetAllRadiosApi> = async function (event, user) {
  logger.trace('GET', ...arguments);

  // Authenticate the user
  if (user === null) {
    return [
      401,
      api401Body,
    ];
  }

  const radios = await typedFullScan<RadioObject>({
    TableName: TABLE_RADIOS,
    ExpressionAttributeNames: {
      '#InUse': 'InUse',
      '#HasEvents': 'HasEvents',
      '#RadioID': 'RadioID',
      '#Name': 'Name',
      '#Count': 'Count',
      '#EventsCount': 'EventsCount',
    },
    ExpressionAttributeValues: {
      ':InUse': 'Y',
      ':HasEvents': 'Y',
    },
    FilterExpression: '#InUse = :InUse OR #HasEvents = :HasEvents',
    ProjectionExpression: '#RadioID,#Name,#Count,#EventsCount',
  });

  return [
    200,
    {
      count: radios.Items.length,
      loadedAll: radios.LastEvaluatedKey === null,
      runs: radios.Runs,
      radios: radios.Items,
    },
  ];
};

export const main = handleResourceApi.bind(null, {
  GET,
});
