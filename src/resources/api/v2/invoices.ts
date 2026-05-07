import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';
import { validateRequest } from './_utils';

import {
  api401Body, api403Body, api500Body, generateApi400Body
} from '@/types/api/_shared';
import {
  Invoice,
  ListInvoicesApi,
  listInvoicesApiQueryValidator
} from '@/types/api/invoices';
import { TypedQueryInput } from '@/types/backend/dynamo';
import { TABLE_INVOICE } from '@/types/backend/environment';
import {
  typedQuery, typedScan
} from '@/utils/backend/dynamoTyped';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('api/v2/invoices');

function getTodayDateStringUtc() {
  return new Date().toISOString()
    .slice(0, 10);
}

const GET: LambdaApiFunction<ListInvoicesApi> = async function (event, user, userPerms) {
  logger.debug('GET', ...arguments);

  // Authorize the user
  if (user === null) {
    return [
      401,
      api401Body,
    ];
  }
  if (!userPerms.isAdmin) {
    return [
      403,
      api403Body,
    ];
  }

  const {
    query,
    validationErrors,
  } = validateRequest<ListInvoicesApi>({
    queryRaw: event.queryStringParameters || {},
    queryValidator: listInvoicesApiQueryValidator,
  });
  if (
    query === null ||
    validationErrors.length > 0
  ) {
    return [
      400,
      generateApi400Body(validationErrors),
    ];
  }

  const departmentsParam = query.departments || (
    query.department && query.department !== 'all'
      ? query.department
      : undefined
  );
  const beforeDate = query.before;
  const afterDate = query.after;
  const lastKeyParam = query.lastKey;

  // Parse and validate limit / lastKey
  const limit = typeof query.limit === 'number'
    ? query.limit
    : 50;
  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    return [
      400,
      generateApi400Body([ 'limit', ]),
    ];
  }

  let lastKey: Record<string, unknown> | undefined;
  if (lastKeyParam) {
    try {
      const parsed = JSON.parse(Buffer.from(lastKeyParam, 'base64').toString());
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        throw new Error('Invalid lastKey');
      }
      lastKey = parsed as Record<string, unknown>;
    } catch {
      return [
        400,
        generateApi400Body([ 'lastKey', ]),
      ];
    }
  }

  // Determine which departments to query
  let departmentsToQuery: string[] = [];
  if (departmentsParam) {
    // Parse comma-separated departments
    departmentsToQuery = [ ...new Set(departmentsParam
      .split(',')
      .map(d => d.trim())
      .filter(Boolean)), ];

    if (departmentsToQuery.length === 0) {
      return [
        400,
        generateApi400Body([ 'departments', ]),
      ];
    }

    // Verify user has access to all requested departments
    if (!user.isDistrictAdmin) {
      const userDepts = userPerms.adminDepartments;
      const unauthorized = departmentsToQuery.filter(
        d => !userDepts.includes(d as typeof userDepts[number])
      );
      if (unauthorized.length > 0) {
        return [
          403,
          api403Body,
        ];
      }
    }
  } else {
    // If no departments specified, use user's admin departments
    if (user.isDistrictAdmin) {
      // District admin gets all departments - use scan instead
      departmentsToQuery = [];
    } else {
      // Department admin gets their departments
      departmentsToQuery = userPerms.adminDepartments;
    }
  }

  // Fetch invoices
  try {
    let allInvoices: Invoice[] = [];
    let finalLastKey: Record<string, unknown> | undefined;

    // Query directly when scoped to a single department; use a filtered scan otherwise.
    if (departmentsToQuery.length === 1) {
      const filterParts: string[] = [];
      const expressionAttributeNames: Record<string, string> = {
        '#dept': 'department',
      };
      const expressionAttributeValues: Record<string, unknown> = {
        ':dept': departmentsToQuery[0],
      };

      if (beforeDate) {
        expressionAttributeNames['#endDate'] = 'endDate';
        expressionAttributeValues[':beforeDate'] = beforeDate;
        filterParts.push('#endDate < :beforeDate');
      }
      if (afterDate) {
        expressionAttributeNames['#startDate'] = 'startDate';
        expressionAttributeValues[':afterDate'] = afterDate;
        filterParts.push('#startDate > :afterDate');
      }

      const queryInput: TypedQueryInput<Invoice> = {
        TableName: TABLE_INVOICE(),
        IndexName: 'departmentIndex',
        KeyConditionExpression: '#dept = :dept',
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: lastKey,
      };

      if (filterParts.length > 0) {
        queryInput.FilterExpression = filterParts.join(' AND ');
      }

      const queryResult = await typedQuery<Invoice>(queryInput);
      allInvoices = queryResult.Items || [];
      finalLastKey = queryResult.LastEvaluatedKey;
    } else {
      const filterParts: string[] = [];
      const expressionAttributeNames: Record<string, string> = {};
      const expressionAttributeValues: Record<string, unknown> = {};

      if (departmentsToQuery.length > 0) {
        expressionAttributeNames['#department'] = 'department';
        const deptPlaceholders = departmentsToQuery.map((dept, index) => {
          const key = `:dept${index}`;
          expressionAttributeValues[key] = dept;
          return key;
        });
        filterParts.push(`#department IN (${deptPlaceholders.join(', ')})`);
      }

      if (beforeDate) {
        expressionAttributeNames['#endDate'] = 'endDate';
        expressionAttributeValues[':beforeDate'] = beforeDate;
        filterParts.push('#endDate < :beforeDate');
      }
      if (afterDate) {
        expressionAttributeNames['#startDate'] = 'startDate';
        expressionAttributeValues[':afterDate'] = afterDate;
        filterParts.push('#startDate > :afterDate');
      }

      const scanResult = await typedScan<Invoice>({
        TableName: TABLE_INVOICE(),
        Limit: limit,
        ExclusiveStartKey: lastKey,
        ...filterParts.length > 0
          ? {
            FilterExpression: filterParts.join(' AND '),
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
          }
          : {},
      });

      allInvoices = scanResult.Items || [];
      finalLastKey = scanResult.LastEvaluatedKey;
    }

    // Defensive fallback for old data without dates.
    if (beforeDate && afterDate && beforeDate < afterDate) {
      logger.warn('Received before date earlier than after date', {
        beforeDate,
        afterDate,
        today: getTodayDateStringUtc(),
      });
    }

    return [
      200,
      {
        lastItem: finalLastKey ? Buffer.from(JSON.stringify(finalLastKey)).toString('base64') : null,
        invoices: allInvoices,
      },
    ];
  } catch (e) {
    logger.error('Error fetching invoices', e);
    return [
      500,
      api500Body,
    ];
  }
};

export const main = handleResourceApi.bind(null, {
  GET,
});
