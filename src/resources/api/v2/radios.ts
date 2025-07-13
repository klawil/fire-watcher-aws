import {
  LambdaApiFunction,
  getCurrentUser,
  handleResourceApi
} from './_base';

import { api401Body } from '@/types/api/_shared';
import {
  GetAllRadiosApi, RadioObject
} from '@/types/api/radios';
import { typedScan } from '@/utils/backend/dynamoTyped';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('radios');

const GET: LambdaApiFunction<GetAllRadiosApi> = async function (event) {
  logger.trace('GET', ...arguments);

  // Authenticate the user
  const [
    user,
    _,
    userHeaders,
  ] = await getCurrentUser(event);
  if (user === null) {
    return [
      401,
      api401Body,
      userHeaders,
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
    userHeaders,
  ];
};

export const main = handleResourceApi.bind(null, {
  GET,
});
