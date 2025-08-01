import {
  GetSecretValueCommand, SecretsManagerClient
} from '@aws-sdk/client-secrets-manager';
import { QueryCommandOutput } from '@aws-sdk/lib-dynamodb';
import {
  APIGatewayProxyEvent
} from 'aws-lambda';
import { verify } from 'jsonwebtoken';
import { Api } from 'ts-oas';

import {
  FrontendUserObject, FullUserObject,
  districtAdminUserKeys
} from '@/types/api/users';
import {
  TypedQueryInput, TypedQueryOutput
} from '@/types/backend/dynamo';
import { UserPermissions } from '@/types/backend/user';
import { Validator } from '@/types/backend/validation';
import {
  TABLE_USER, typedGet, typedQuery
} from '@/utils/backend/dynamoTyped';
import { validateObject } from '@/utils/backend/validation';
import { getLogger } from '@/utils/common/logger';
import { getUserPermissions } from '@/utils/common/user';

const logger = getLogger('api/v2/_utils');
const secretManager = new SecretsManagerClient();

interface DocClientListOutput<
  ItemType extends object
> extends Omit<TypedQueryOutput<ItemType>, '$metadata'> {
  Items: ItemType[];
  Count: number;
  ScannedCount: number;
  LastEvaluatedKeys: (QueryCommandOutput['LastEvaluatedKey'] | null)[];
  MinSortKey: number | null;
  MaxSortKey: number | null;
  MaxAfterKey: number | null;
}

export type DocumentQueryConfig<T extends object> = Omit<
  TypedQueryInput<T>,
  'TableName' | 'IndexName' | 'Limit' | 'ScanIndexForward' | 'ProjectionExpression'
  | 'FilterExpression' | 'KeyConditionExpression'
> & Required<Pick<
  TypedQueryInput<T>,
  'ExpressionAttributeValues'
>>;

export async function mergeDynamoQueriesDocClient<
  ItemType extends object
>(
  baseConfig: TypedQueryInput<ItemType>,
  queryConfigs: DocumentQueryConfig<ItemType>[],
  sortKey: keyof ItemType,
  afterKey: (keyof ItemType | null) = null
) {
  logger.trace('mergeDynamoQueriesDocClient', ...arguments);
  if (afterKey === null) {
    afterKey = sortKey;
  }

  const scanForward = !!baseConfig.ScanIndexForward;
  const sortDirGreater = scanForward ? 1 : -1;
  const sortDirLesser = scanForward ? -1 : 1;

  // Run the query and combine the items
  const queryResults = await Promise.all(queryConfigs.map(config => typedQuery<ItemType>({
    ...baseConfig,
    ...config,
  })));
  const combinedQueryResults = queryResults.reduce((agg: DocClientListOutput<ItemType>, result) => {
    if (typeof result.Count !== 'undefined') {
      agg.Count += result.Count;
    }

    if (typeof result.ScannedCount !== 'undefined') {
      agg.ScannedCount += result.ScannedCount;
    }

    if (typeof result.Items !== 'undefined') {
      agg.Items = [
        ...agg.Items,
        ...(result.Items as ItemType[]),
      ];
    }

    agg.LastEvaluatedKeys.push(result.LastEvaluatedKey || null);

    return agg;
  }, {
    Items: [],
    Count: 0,
    ScannedCount: 0,
    LastEvaluatedKeys: [],
    MinSortKey: null,
    MaxSortKey: null,
    MaxAfterKey: null,
  });

  // Sort the items
  combinedQueryResults.Items = (combinedQueryResults.Items as ItemType[])
    .filter(v => v[sortKey] !== null)
    .sort((a, b) => {
      if (
        typeof b[sortKey] === 'undefined'
      ) {
        return sortDirGreater;
      }

      if (
        typeof a[sortKey] === 'undefined'
      ) {
        return sortDirLesser;
      }

      if (a[sortKey] === null || b[sortKey] === null) {
        return -1;
      }

      return a[sortKey] > b[sortKey] ? sortDirGreater : sortDirLesser;
    });

  // Limit the returned results
  if (typeof baseConfig.Limit !== 'undefined') {
    combinedQueryResults.Items = combinedQueryResults.Items.slice(0, baseConfig.Limit);
    combinedQueryResults.Count = combinedQueryResults.Items.length;
  }

  // Compute the sort key values
  let minSortKey: null | number = null;
  let maxSortKey: null | number = null;
  let maxAfterKey: null | number = null;
  combinedQueryResults.Items.forEach(item => {
    const sortKeyValue = item[sortKey] as number;
    const afterKeyValue = item[afterKey] as number;

    if (
      !isNaN(sortKeyValue) &&
      (
        minSortKey === null ||
        sortKeyValue < minSortKey
      )
    ) {
      minSortKey = sortKeyValue;
    }

    if (
      !isNaN(sortKeyValue) &&
      (
        maxSortKey === null ||
        sortKeyValue > maxSortKey
      )
    ) {
      maxSortKey = sortKeyValue;
    }

    if (
      !isNaN(afterKeyValue) &&
      (
        maxAfterKey === null ||
        afterKeyValue > maxAfterKey
      )
    ) {
      maxAfterKey = afterKeyValue;
    }
  });
  combinedQueryResults.MinSortKey = minSortKey;
  combinedQueryResults.MaxSortKey = maxSortKey;
  combinedQueryResults.MaxAfterKey = maxAfterKey;

  if (scanForward) {
    combinedQueryResults.Items.reverse();
  }

  return combinedQueryResults;
}

interface Cookies {
  [key: string]: string;
}

export function getCookies(event: APIGatewayProxyEvent): Cookies {
  logger.trace('getCookies', event);
  return (event.headers.Cookie || '')
    .split('; ')
    .reduce((agg: Cookies, val) => {
      const valSplit = val.split('=');
      if (valSplit[0] !== '') {
        if (valSplit.length < 2) {
          valSplit.push('');
        }

        agg[valSplit[0]] = valSplit[1];
      }
      return agg;
    }, {});
}

export function getFrontendUserObj(
  user: FullUserObject
): FrontendUserObject {
  const newUser: FrontendUserObject = { ...user, };
  (Object.keys(newUser) as (keyof typeof newUser)[]).forEach(key => {
    if (key in newUser && !districtAdminUserKeys.includes(key)) {
      delete newUser[key];
    }
  });

  return newUser;
}

const authUserCookie = 'cofrn-user';
const authTokenCookie = 'cofrn-token';

export function getDeleteCookieHeader(cookie: string) {
  return `${encodeURIComponent(cookie)}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export function getSetCookieHeader(cookie: string, value: string, age: number) {
  return `${encodeURIComponent(cookie)}=${encodeURIComponent(value)}; Secure; SameSite=None; Path=/; Max-Age=${age}`;
}

const jwtSecretArn = process.env.JWT_SECRET;

export async function getCurrentUser(event: APIGatewayProxyEvent): Promise<[
  Readonly<FrontendUserObject | null>,
  Readonly<UserPermissions>,
  {
    'Set-Cookie'?: string[];
  }
]> {
  logger.trace('getCurrentUser', event);

  const response: [
    FrontendUserObject | null,
    UserPermissions,
    {
      'Set-Cookie'?: string[];
    }
  ] = [
    null,
    getUserPermissions(null),
    {},
  ];

  try {
    const cookies = getCookies(event);

    // Cookie to delete if the user is invalid
    const cookieDeletions = Object.keys(cookies)
      .filter(cookie => cookie.startsWith('cofrn'))
      .map(cookie => getDeleteCookieHeader(cookie));
    if (cookieDeletions.length > 0) {
      response[2]['Set-Cookie'] = cookieDeletions;
    }

    // Check for the authentication cookies
    if (
      !(authUserCookie in cookies) ||
      !(authTokenCookie in cookies)
    ) {
      return response;
    }

    // Use JWT to validate the user (first pass)
    const jwtSecret = await secretManager.send(new GetSecretValueCommand({
      SecretId: jwtSecretArn,
    }))
      .then(data => data.SecretString);
    if (typeof jwtSecret === 'undefined') {
      throw new Error('Unable to get JWT secret');
    }
    const userPayload = verify(
      cookies[authTokenCookie],
      jwtSecret
    );
    if (
      typeof userPayload === 'string' ||
      !('phone' in userPayload)
    ) {
      logger.error('Bad payload', userPayload);
      throw new Error('Wrong JWT payload');
    }

    // Get the user object from DynamoDB
    const user = await typedGet<FullUserObject>({
      TableName: TABLE_USER,
      Key: {
        phone: userPayload.phone,
      },
    });
    if (!user.Item) {
      logger.warn('getCurrentUser', 'failed', `Invalid user from cookie - ${cookies[authUserCookie]}`);
      return response;
    }

    // Remove the cookie deletion
    response[2] = {};

    // Parse the user
    const userObj = response[0] = getFrontendUserObj(user.Item);
    response[1] = getUserPermissions(userObj);
  } catch (e) {
    logger.error('getCurrentUser', e);
    return response;
  }

  return response;
}

export function parseJsonBody<T extends object>(
  body: string | null,
  validator?: Validator<T>
): [T | null, string[] ] {
  logger.trace('parseJsonBody', ...arguments);
  try {
    if (body === null) {
      throw new Error('Invalid JSON body - null');
    }

    const parsed = JSON.parse(body);

    if (validator) {
      return validateObject<T>(parsed, validator);
    }

    return [
      parsed as T,
      [],
    ];
  } catch (e) {
    logger.error('Error parsing body', body, e);
    return [
      null,
      [],
    ];
  }
}

export function validateRequest<A extends Api>({
  paramsRaw, paramsValidator,
  bodyRaw, bodyParser, bodyValidator,
  queryRaw, queryValidator,
}: {
  paramsRaw?: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  paramsValidator?: Validator<A['params']>,
  bodyRaw?: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  bodyParser?: 'json',
  bodyValidator?: Validator<A['body']>,
  queryRaw?: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  queryValidator?: Validator<A['query']>,
}): {
    params: A['params'] | null,
    body: A['body'] | null,
    query: A['query'] | null,
    validationErrors: string[],
  } {
  const response: ReturnType<typeof validateRequest<A>> = {
    params: null,
    body: null,
    query: null,
    validationErrors: [],
  };

  // Validate the params
  if (typeof paramsValidator !== 'undefined') {
    const [
      params,
      paramsErrors,
    ] = validateObject(
      paramsRaw,
      paramsValidator
    );
    if (params !== null) {
      response.params = params;
    }
    if (paramsErrors.length > 0) {
      response.validationErrors = [
        ...response.validationErrors,
        ...paramsErrors,
      ];
    }
  }

  // Validate the query
  if (typeof queryValidator !== 'undefined') {
    const [
      query,
      queryErrors,
    ] = validateObject(
      queryRaw,
      queryValidator
    );
    if (query !== null) {
      response.query = query;
    }
    if (queryErrors.length > 0) {
      response.validationErrors = [
        ...response.validationErrors,
        ...queryErrors,
      ];
    }
  }

  // Validate the body
  if (typeof bodyValidator !== 'undefined') {
    // Use the JSON parser if needed
    let body: typeof response['body'] = null;
    let bodyErrors: typeof response['validationErrors'] = [];
    if (bodyParser === 'json') {
      [
        body,
        bodyErrors,
      ] = parseJsonBody(
        bodyRaw,
        bodyValidator
      );
    } else {
      [
        body,
        bodyErrors,
      ] = validateObject(
        bodyRaw,
        bodyValidator
      );
    }
    if (body !== null) {
      response.body = body;
    }
    if (bodyErrors.length > 0) {
      response.validationErrors = [
        ...response.validationErrors,
        ...bodyErrors,
      ];
    }
  }

  return response;
}
