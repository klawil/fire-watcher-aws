import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';

import { generateApi400Body } from '@/types/api/_shared';
import {
  DidRestartApi, GetShouldRestartApi,
  restartApiValidator
} from '@/types/api/restart';
import { getCachedAlarmData } from '@/utils/backend/alarmStatus';
import { sendAlertMessage } from '@/utils/backend/texts';
import { validateObject } from '@/utils/backend/validation';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('resources/api/v2/restart');

const alarmKeyMap: {
  [key in GetShouldRestartApi['params']['tower']]: string;
} = {
  PoolTable: 'Crestone Recorder Status',
  Saguache: 'Saguache Recorder Status',
  SanAntonio: 'Crestone Recorder Status',
};

const GET: LambdaApiFunction<GetShouldRestartApi> = async function (event) {
  logger.trace('GET', ...arguments);

  // Validate the parameters
  const [
    params,
    paramsErrors,
  ] = validateObject<GetShouldRestartApi['params']>(
    event.pathParameters,
    restartApiValidator
  );
  if (
    params === null ||
    paramsErrors.length > 0
  ) {
    return [
      400,
      generateApi400Body(paramsErrors),
    ];
  }

  // Determine the response
  const alarmStatus = await getCachedAlarmData();
  const alarmName = alarmKeyMap[params.tower];
  const status = alarmStatus[alarmName];
  if (
    typeof status === 'undefined' ||
    typeof status.lastAlarm === 'undefined' ||
    (
      typeof status.lastOk !== 'undefined' &&
      status.lastOk > status.lastAlarm
    )
  ) {
    return [
      204,
      '0',
    ];
  }

  logger.log(`Restarting ${params.tower}:`, status);

  return [
    205,
    '1',
    {},
    'text/plain',
  ];
};

const POST: LambdaApiFunction<DidRestartApi> = async function (event) {
  logger.trace('POST', ...arguments);

  // Validate the parameters
  const [
    params,
    paramsErrors,
  ] = validateObject<GetShouldRestartApi['params']>(
    event.pathParameters,
    restartApiValidator
  );
  if (
    params === null ||
    paramsErrors.length > 0
  ) {
    return [
      400,
      generateApi400Body(paramsErrors),
    ];
  }

  await sendAlertMessage('Dtr', `${params.tower} restarted`);

  return [
    200,
    '',
  ];
};

export const main = handleResourceApi.bind(null, {
  GET,
  POST,
});
