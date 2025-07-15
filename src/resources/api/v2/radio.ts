import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';
import { validateRequest } from './_utils';

import {
  api401Body, api403Body, generateApi400Body
} from '@/types/api/_shared';
import {
  PatchRadioApi, patchRadioApiBodyValidator, patchRadioApiParamsValidator
} from '@/types/api/radios';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('resources/api/v2/radio');

const PATCH: LambdaApiFunction<PatchRadioApi> = async function (event, user, userPerms) {
  logger.trace('PATCH', ...arguments);

  // Validate the request
  const {
    params,
    body,
    validationErrors,
  } = validateRequest<PatchRadioApi>({
    paramsRaw: event.pathParameters,
    paramsValidator: patchRadioApiParamsValidator,
    bodyRaw: event.body,
    bodyParser: 'json',
    bodyValidator: patchRadioApiBodyValidator,
  });
  if (
    params === null ||
    body === null ||
    validationErrors.length > 0
  ) {
    return [
      400,
      generateApi400Body(validationErrors),
    ];
  }

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

  return [
    200,
    {
      RadioID: '',
      Name: '',
    },
  ];
};

export const main = handleResourceApi.bind(null, {
  PATCH,
});
