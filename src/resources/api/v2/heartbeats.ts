import { CloudWatch } from 'aws-sdk';

import {
  LambdaApiFunction,
  getCurrentUser, handleResourceApi,
  parseJsonBody
} from './_base';

import {
  api401Body, api403Body,
  generateApi400Body
} from '@/types/api/_shared';
import {
  AddHeartbeatApi,
  GetAllHeartbeatsApi, Heartbeat,
  addHeartbeatBodyValidator
} from '@/types/api/heartbeats';
import {
  TABLE_STATUS, typedScan,
  typedUpdate
} from '@/utils/backend/dynamoTyped';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('resources/api/v2/heartbeats');
const cloudWatch = new CloudWatch();

const GET: LambdaApiFunction<GetAllHeartbeatsApi> = async function (event) {
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

  // Get the items to return
  const heartbeats = await typedScan<Heartbeat>({
    TableName: TABLE_STATUS,
  });

  return [
    200,
    heartbeats.Items || [],
    userHeaders,
  ];
};

const POST: LambdaApiFunction<AddHeartbeatApi> = async function (event) {
  // Parse and validate the body
  const [
    body,
    bodyErrors,
  ] = parseJsonBody(
    event.body,
    addHeartbeatBodyValidator
  );
  if (
    body === null ||
    bodyErrors.length > 0
  ) {
    return [
      400,
      generateApi400Body(bodyErrors),
    ];
  }

  // Send the metric
  const metricPromise = cloudWatch.putMetricData({
    Namespace: 'VHF Metrics',
    MetricData: [ {
      MetricName: body.Server,
      Timestamp: new Date(),
      Unit: 'Count',
      Value: 1,
    }, ],
  }).promise();

  // Insert the update into the status table
  await typedUpdate<Heartbeat>({
    TableName: TABLE_STATUS,
    Key: {
      Server: body.Server,
    },
    ExpressionAttributeNames: {
      '#IsPrimary': 'IsPrimary',
      '#IsActive': 'IsActive',
      '#LastHeartbeat': 'LastHeartbeat',
    },
    ExpressionAttributeValues: {
      ':IsPrimary': body.IsPrimary,
      ':IsActive': body.IsActive,
      ':LastHeartbeat': Date.now(),
    },
    UpdateExpression: 'SET #IsPrimary = :IsPrimary, #IsActive = :IsActive, #LastHeartbeat = :LastHeartbeat',
  });

  // Get the other heartbeats
  const data = (await typedScan<Heartbeat>({
    TableName: TABLE_STATUS,
  })).Items || [];

  // Wait for everything to finish and send the response
  await metricPromise;
  return [
    200,
    data,
  ];
};

export const main = handleResourceApi.bind(null, {
  GET,
  POST,
});
