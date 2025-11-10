import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';

import {
  api401Body, api403Body
} from '@/types/api/_shared';
import { GetAladtecUsersApi } from '@/types/api/aladtec';
import { getShiftData } from '@/utils/backend/shiftData';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('resources/api/v2/aladtec');

const GET: LambdaApiFunction<GetAladtecUsersApi> = async function (event, user, userPerms) {
  logger.trace('GET', ...arguments);

  // Authorize the user
  if (user === null) {
    return [
      401,
      api401Body,
    ];
  }
  if (!userPerms.isDistrictAdmin) {
    return [
      403,
      api403Body,
    ];
  }

  const shiftData = await getShiftData();

  return [
    200,
    shiftData.people,
  ];
};

export const main = handleResourceApi.bind(null, {
  GET,
});
