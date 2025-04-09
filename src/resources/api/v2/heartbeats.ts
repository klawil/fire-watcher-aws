import { GetAllHeartbeatsApi, Heartbeat } from "@/types/api/heartbeats";
import { getCurrentUser, handleResourceApi, LambdaApiFunction } from "./_base";
import { getLogger } from "@/utils/common/logger";
import { api401Body, api403Body } from "@/types/api/_shared";
import { TABLE_STATUS, typedScan } from "@/utils/backend/dynamoTyped";

const logger = getLogger('resources/api/v2/heartbeats');

const GET: LambdaApiFunction<GetAllHeartbeatsApi> = async function (event) {
  logger.trace('GET', ...arguments);

  // Authorize the user
  const [ user, userPerms, userHeaders ] = await getCurrentUser(event);
  if (user === null) return [ 401, api401Body, userHeaders ];
  if (!userPerms.isAdmin) return [ 403, api403Body, userHeaders ];

  // Get the items to return
  const heartbeats = await typedScan<Heartbeat>({
    TableName: TABLE_STATUS,
  });

  return [ 200, heartbeats.Items || [], userHeaders ];
}

export const main = handleResourceApi.bind(null, {
  GET,
});
