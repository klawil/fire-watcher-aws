import { CloudWatch } from 'aws-sdk';

import {
  LambdaApiFunction,
  handleResourceApi,
  parseJsonBody
} from './_base';

import {
  api200Body, generateApi400Body
} from '@/types/api/_shared';
import {
  AddMetricsApi, addMetricsApiBodyValidator
} from '@/types/api/metrics';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('resources/api/v2/metricsAdd');
const cloudWatch = new CloudWatch();

const POST: LambdaApiFunction<AddMetricsApi> = async function (event) {
  logger.trace('POST', ...arguments);
  const eventTime = new Date();

  // Validate the body
  const [
    body,
    bodyErrors,
  ] = parseJsonBody(
    event.body,
    addMetricsApiBodyValidator
  );
  if (
    body === null ||
    bodyErrors.length > 0 ||
    body.data.length === 0
  ) {
    return [
      400,
      generateApi400Body(bodyErrors),
    ];
  }

  // Map the ID to the tower
  const towerMapping: Record<string, string> = {
    saguache: 'Saguache Tower',
    pooltable: 'Pool Table Mountain',
    alamosa: 'Alamosa',
    sanantonio: 'San Antonio Peak',
  };

  // Send the metrics
  await cloudWatch.putMetricData({
    Namespace: 'DTR Metrics',
    MetricData: body.data.map(i => ({
      MetricName: 'Decode Rate',
      Dimensions: [ {
        Name: 'Tower',
        Value: towerMapping[i.id] || i.id,
      }, ],
      Timestamp: eventTime,
      Unit: 'Count',
      Value: i.val,
    })),
  }).promise();

  return [
    200,
    api200Body,
  ];
};

export const main = handleResourceApi.bind(null, {
  POST,
});
