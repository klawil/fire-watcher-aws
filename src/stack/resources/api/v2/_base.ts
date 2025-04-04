import { api403Response, Validator } from "@/common/apiv2/_shared";
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { Api } from "ts-oas";
import * as AWS from 'aws-sdk';
import { getLogger } from "../../utils/logger";
import { districtAdminUserKeys, FrontendUserObject, FullUserObject, UserDepartment, validDepartments } from "@/common/apiv2/users";

const logger = getLogger('api/v2/_base');

export const TABLE_FILE = process.env.TABLE_FILE as string;
export const TABLE_USER = process.env.TABLE_USER as string;
export const TABLE_TEXT = process.env.TABLE_TEXT as string;
export const TABLE_SITE = process.env.TABLE_SITE as string;
export const TABLE_TALKGROUP = process.env.TABLE_TALKGROUP as string;

export type LambdaApiFunction<T extends Api> = (
  event: APIGatewayProxyEvent,
) => Promise<[
  keyof T['responses'],
  T['responses'][keyof T['responses']],
  APIGatewayProxyResult['multiValueHeaders']?
]>;

export async function handleResourceApi(
  handlers: {
    [key in Api['method']]?: (event: APIGatewayProxyEvent) => Promise<[
      number,
      unknown,
      APIGatewayProxyResult['multiValueHeaders']?,
    ]>;
  },
  event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
  logger.trace('handleResourceApi', ...arguments);
  const method = event.httpMethod as Api['method'];
  if (typeof handlers[method] !== 'undefined') {
    const [
      statusCode,
      responseBody,
      responseHeaders,
    ] = await handlers[method](event);
    return {
      statusCode: statusCode,
      body: JSON.stringify(responseBody),
      multiValueHeaders: responseHeaders || {},
    };
  }

  return api403Response;
}

const docClient = new AWS.DynamoDB.DocumentClient({ apiVersion: "2012-08-10" });

interface DocClientListOutput<
	ItemType extends AWS.DynamoDB.DocumentClient.AttributeMap
> extends AWS.DynamoDB.DocumentClient.QueryOutput {
	Items: ItemType[],
	Count: number;
	ScannedCount: number;
	LastEvaluatedKeys: (AWS.DynamoDB.DocumentClient.Key | null)[];
	MinSortKey: number | null;
	MaxSortKey: number | null;
	MaxAfterKey: number | null;
}

export type DocumentQueryConfig = Omit<
  AWS.DynamoDB.DocumentClient.QueryInput,
	'TableName' | 'IndexName' | 'Limit' | 'ScanIndexForward' | 'ProjectionExpression'
	| 'FilterExpression' | 'KeyConditionExpression'
> & Required<Pick<
  AWS.DynamoDB.DocumentClient.QueryInput,
	'ExpressionAttributeValues'
>>

export async function mergeDynamoQueriesDocClient<
	ItemType extends AWS.DynamoDB.DocumentClient.AttributeMap
>(
	baseConfig: AWS.DynamoDB.DocumentClient.QueryInput,
	queryConfigs: DocumentQueryConfig[],
	sortKey: keyof ItemType,
	afterKey: (keyof ItemType | null) = null,
) {
	logger.trace('mergeDynamoQueriesDocClient', ...arguments);
	if (afterKey === null) {
		afterKey = sortKey;
	}

	const scanForward = !!baseConfig.ScanIndexForward;
	const sortDirGreater = scanForward ? 1 : -1;
	const sortDirLesser = scanForward ? -1 : 1;

	// Run the query and combine the items
	const queryResults = await Promise.all(queryConfigs.map(config => docClient.query({
		...baseConfig,
		...config
	}).promise()));
	const combinedQueryResults = queryResults.reduce((agg: DocClientListOutput<ItemType>, result) => {
		if (typeof result.Count !== 'undefined')
			agg.Count += result.Count;
		
		if (typeof result.ScannedCount !== 'undefined')
			agg.ScannedCount += result.ScannedCount;
	
		if (typeof result.Items !== 'undefined')
			agg.Items = [
				...agg.Items,
				...(result.Items as ItemType[]),
			];
		
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
	combinedQueryResults.Items = (combinedQueryResults.Items as ItemType[]).sort((a, b) => {
		if (
			typeof b[sortKey] === 'undefined'
		) return sortDirGreater;

		if (
			typeof a[sortKey] === 'undefined'
		) return sortDirLesser;

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
		const sortKeyValue = item[sortKey];
		const afterKeyValue = item[afterKey];

		if (
			!isNaN(sortKeyValue) &&
			(
				minSortKey === null ||
				sortKeyValue < minSortKey
			)
		) minSortKey = sortKeyValue;

		if (
			!isNaN(sortKeyValue) &&
			(
				maxSortKey === null ||
				sortKeyValue > maxSortKey
			)
		) maxSortKey = sortKeyValue;

		if (
			!isNaN(afterKeyValue) &&
			(
				maxAfterKey === null ||
				afterKeyValue > maxAfterKey
			)
		) maxAfterKey = afterKeyValue;
	});
	combinedQueryResults.MinSortKey = minSortKey;
	combinedQueryResults.MaxSortKey = maxSortKey;
	combinedQueryResults.MaxAfterKey = maxAfterKey;

	if (scanForward)
		combinedQueryResults.Items.reverse();

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

interface UserPermissions {
  isUser: boolean;
  isAdmin: boolean;
  isDistrictAdmin: boolean;
  adminDepartments: UserDepartment[];
}

const authUserCookie = 'cofrn-user';
const authTokenCookie = 'cofrn-token';

function getDeleteCookieHeader(cookie: string) {
  return `${encodeURIComponent(cookie)}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}

export function getSetCookieHeader(cookie: string, value: string, age: number) {
  return `${encodeURIComponent(cookie)}=${encodeURIComponent(value)}; Secure; SameSite=None; Path=/; Max-Age=${age}`;
}

export function getUserPermissions(user: FullUserObject | null): UserPermissions {
  const userPerms: UserPermissions = {
    isUser: false,
    isAdmin: false,
    isDistrictAdmin: false,
    adminDepartments: [],
  };
  if (user === null) return userPerms;

  // Determine the permissions
  const activeDepartments = validDepartments.filter(dep => user[dep]?.active);
  userPerms.adminDepartments = activeDepartments.filter(dep => user[dep]?.admin);
  userPerms.isUser = activeDepartments.length > 0;
  userPerms.isAdmin = userPerms.adminDepartments.length > 0;
  userPerms.isDistrictAdmin = !!user.isDistrictAdmin;

  return userPerms;
}

export async function getCurrentUser(event: APIGatewayProxyEvent): Promise<[
  FrontendUserObject | null,
  UserPermissions,
  {
    'Set-Cookie'?: string[];
  },
]> {
	logger.trace('getCurrentUser', event);

  const response: [
    FrontendUserObject | null,
    UserPermissions,
    {
      'Set-Cookie'?: string[];
    },
  ] = [ null, getUserPermissions(null), {} ];

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
    ) return response;

    // Validate the cookies
    if (!/^[0-9]{10}$/.test(cookies[authUserCookie])) {
      return response;
    }

    // Get the user object from DynamoDB
    const user = await docClient.get({
      TableName: TABLE_USER,
      Key: {
        phone: Number(cookies[authUserCookie]),
      },
    }).promise();
    if (!user.Item) {
      logger.warn('getCurrentUser', 'failed', `Invalid user from cookie - ${cookies[authUserCookie]}`);
      return response;
    }

    // Validate the token
    const currentTime = Date.now();
    const matchingTokens = (user.Item as FullUserObject).loginTokens
      ?.filter(t => t.token === cookies[authTokenCookie])
      .map(t => t.tokenExpiry || 0)
      .filter(expiry => expiry > currentTime);
    if (
      !matchingTokens ||
      matchingTokens.length === 0
    ) {
      logger.warn('getCurrentUser', 'failed', 'invalid token');
      return response;
    }

    // Remove the cookie deletion
    response[2] = {};

    // Parse the user
    const userObj = response[0] = getFrontendUserObj(user.Item as FullUserObject);
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
): [T | null, (keyof T)[] ] {
	logger.trace('validateBodyIsJson', ...arguments);
  try {
    if (body === null) {
      throw new Error(`Invalid JSON body - null`);
    }

    const parsed = JSON.parse(body);

    if (validator)
      return checkObject<T>(parsed, validator);

    return [ parsed as T, [] ];
  } catch (e) {
    logger.error(`Error parsing body`, body, e);
    return [ null, [] ];
  }
}

export function checkObject<T extends object>(
  obj: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  validator: Validator<T>
): [T | null, (keyof T)[] ] {
  const newObj: Partial<T> = {};

  // Validate the object
  const objKeys = Object.keys(validator) as (keyof typeof validator)[];
  const badKeys: (keyof typeof validator)[] = [];
  if (
    typeof obj !== 'object' ||
    Array.isArray(obj) ||
    obj === null
  ) {
    return [ null, objKeys ];
  }

  // Loop over the keys
  objKeys.forEach(key => {
    const config = validator[key];

    // If the key is undefined, show an error if it is required
    if (typeof obj[key] === 'undefined') {
      if ('required' in config) {
        badKeys.push(key);
      }
      return;
    }

    // Validate using the different types
    const value = config.parse ? config.parse(obj[key]) : obj[key];
    let foundType = false;

    // Validate strings
    if (typeof value === 'string') {
      const conf = config.types.string;
      if (
        !conf ||
        (conf.regex && !conf.regex.test(value)) ||
        (conf.exact && !conf.exact.includes(value))
      ) {
        logger.error(
          `Failed to validate ${String(key)} as string`,
          obj[key],
          value,
          conf,
          (conf?.regex && !conf.regex.test(value)),
          (conf?.exact && !conf.exact.includes(value)),
        );
        badKeys.push(key);
        return;
      }
      foundType = true;
    }

    // Validate numbers
    if (typeof value === 'number') {
      const conf = config.types.number;
      if (
        !conf ||
        Number.isNaN(value) ||
        (conf.regex && !conf.regex.test(value.toString())) ||
        (conf.exact && !conf.exact.includes(value))
      ) {
        logger.error(
          `Failed to validate ${String(key)} as number`,
          obj[key],
          value,
          conf,
          Number.isNaN(value),
          (conf?.regex && !conf.regex.test(value.toString())),
          (conf?.exact && !conf.exact.includes(value)),
        );
        badKeys.push(key);
        return;
      }
      foundType = true;
    }

    // Validate booleans
    if (typeof value === 'boolean') {
      const conf = config.types.boolean;
      if (
        !conf ||
        (conf.regex && !conf.regex.test(value.toString())) ||
        (conf.exact && !conf.exact.includes(value))
      ) {
        logger.error(
          `Failed to validate ${String(key)} as boolean`,
          obj[key],
          value,
          conf,
          (conf?.regex && !conf.regex.test(value.toString())),
          (conf?.exact && !conf.exact.includes(value)),
        );
        badKeys.push(key);
        return;
      }
      foundType = true;
    }

    // Validate arrays
    if (Array.isArray(value)) {
      const conf = config.types.array;
      if (
        !conf ||
        (conf.regex && value.some(v => !conf.regex?.test(v.toString()))) ||
        (conf.exact && value.some(v => !conf.exact?.includes(v)))
      ) {
        logger.error(
          `Failed to validate ${String(key)} as boolean`,
          obj[key],
          value,
          conf,
          (conf?.regex && value.some(v => !conf.regex?.test(v.toString()))),
          (conf?.exact && value.some(v => !conf.exact?.includes(v))),
        );
        badKeys.push(key);
        return;
      }
      foundType = true;
    }

    // Validate null values
    if (value === null) {
      const conf = config.types.null;
      if (!conf) {
        logger.error(
          `Failed to validate ${String(key)} as null`,
          obj[key],
          value,
          conf,
        );
        badKeys.push(key);
        return;
      }
      foundType = true;
    }

    // If it isn't a valid type
    if (!foundType) {
      badKeys.push(key);
      return;
    }
    
    // Add the key to the object
    newObj[key] = value;
  });

  if (badKeys.length > 0) {
    return [ null, badKeys ];
  }

  return [
    newObj as T,
    [],
  ];
}
