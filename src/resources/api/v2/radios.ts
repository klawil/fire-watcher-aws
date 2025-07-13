import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';

import { api401Body } from '@/types/api/_shared';
import {
  GetAllRadiosApi, RadioObject
} from '@/types/api/radios';
import { typedScan } from '@/utils/backend/dynamoTyped';
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

  const radios = await typedScan<RadioObject>({
    TableName: process.env.TABLE_RADIOS,
  });

  return [
    200,
    {
      count: radios.Items?.length || 0,
      radios: radios.Items || [],
    },
  ];
};

export const main = handleResourceApi.bind(null, {
  GET,
});
