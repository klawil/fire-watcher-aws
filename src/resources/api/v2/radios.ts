import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';

import {
  GetAllRadiosApi, RadioObject
} from '@/types/api/radios';
import { typedScan } from '@/utils/backend/dynamoTyped';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('radios');

const GET: LambdaApiFunction<GetAllRadiosApi> = async function () {
  logger.trace('GET', ...arguments);

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
