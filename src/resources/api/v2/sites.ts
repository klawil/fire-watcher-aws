import {
  LambdaApiFunction,
  getCurrentUser, handleResourceApi
} from './_base';

import {
  api401Body, api403Body
} from '@/types/api/_shared';
import {
  FullSiteObject, GetAllSitesApi
} from '@/types/api/sites';
import {
  TABLE_SITE, typedQuery
} from '@/utils/backend/dynamoTyped';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('stack/resources/api/v2/sites');

const GET: LambdaApiFunction<GetAllSitesApi> = async function (event) {
  logger.trace('GET', ...arguments);

  // Authorize the user
  const [
    user,
    userPerms,
    userHeaders,
  ] = await getCurrentUser(event);
  if (user === null) {
    return [
      401,
      api401Body,
      userHeaders,
    ];
  }
  if (!userPerms.isAdmin) {
    return [
      403,
      api403Body,
      userHeaders,
    ];
  }

  // Retrieve the sites
  const sites = await typedQuery<FullSiteObject>({
    TableName: TABLE_SITE,
    IndexName: 'active',
    ExpressionAttributeNames: { '#IsActive': 'IsActive', },
    ExpressionAttributeValues: { ':IsActive': 'y', },
    KeyConditionExpression: '#IsActive = :IsActive',
  });

  return [
    200,
    {
      count: (sites.Items || []).length,
      sites: sites.Items || [],
    },
    userHeaders,
  ];
};

export const main = handleResourceApi.bind(null, {
  GET,
});
