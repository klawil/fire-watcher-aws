import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';
import {
  getCookies, getDeleteCookieHeader
} from './_utils';

import {
  api302Body, generateApi400Body
} from '@/types/api/_shared';
import {
  LogoutApi, logoutApiQueryValidator
} from '@/types/api/auth';
import { validateObject } from '@/utils/backend/validation';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('stack/resources/api/v2/logout');

const GET: LambdaApiFunction<LogoutApi> = async function (event) {
  logger.trace('GET', ...arguments);

  // Validate the query parameters
  const [
    query,
    queryErrors,
  ] = validateObject<LogoutApi['query']>(
    event.queryStringParameters || {},
    logoutApiQueryValidator
  );
  if (
    query === null ||
    queryErrors.length > 0
  ) {
    return [
      400,
      generateApi400Body(queryErrors),
    ];
  }

  // Default to returning to the homepage
  if (typeof query.redirectTo === 'undefined') {
    query.redirectTo = '/';
  }

  // Find the cookies to delete
  const cookies = getCookies(event);
  const setCookieHeaders: string[] = [];
  Object.keys(cookies)
    .filter(key => key.includes('cvfd') || key.includes('cofrn'))
    .forEach(key => setCookieHeaders.push(getDeleteCookieHeader(key)));

  // Return the response
  return [
    302,
    api302Body,
    {
      'Set-Cookie': setCookieHeaders,
      'Location': [ query.redirectTo, ],
    },
  ];
};

export const main = handleResourceApi.bind(null, {
  GET,
});
