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

interface InvoiceCursorKey {
  id: string;
  department: string;
  generatedDate: string;
}

interface ScanCursorKey {
  id: string;
}

interface MultiDepartmentCursor {
  mode: 'multi';
  departmentKeys: Record<string, InvoiceCursorKey | null>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInvoiceCursorKey(value: unknown): value is InvoiceCursorKey {
  return isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.department === 'string' &&
    typeof value.generatedDate === 'string';
}

function isScanCursorKey(value: unknown): value is ScanCursorKey {
  return isRecord(value) && typeof value.id === 'string';
}

function getInvoiceCursorKey(item: Invoice): InvoiceCursorKey | null {
  if (
    typeof item.id !== 'string' ||
    typeof item.department !== 'string' ||
    typeof item.generatedDate !== 'string'
  ) {
    return null;
  }

  return {
    id: item.id,
    department: item.department,
    generatedDate: item.generatedDate,
  };
}

function isMultiDepartmentCursor(
  value: unknown,
  departmentsToQuery: string[]
): value is MultiDepartmentCursor {
  if (!isRecord(value) || value.mode !== 'multi' || !isRecord(value.departmentKeys)) {
    return false;
  }

  for (const department of departmentsToQuery) {
    const departmentValue = value.departmentKeys[department];
    if (departmentValue === null) {
      continue;
    }

    if (!isInvoiceCursorKey(departmentValue)) {
      return false;
    }

    if (departmentValue.department !== department) {
      return false;
    }
  }

  return true;
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

  let parsedLastKey: unknown;
  if (lastKeyParam) {
    try {
      const parsed = JSON.parse(Buffer.from(lastKeyParam, 'base64').toString());
      parsedLastKey = parsed;
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
    let responseLastItem: string | null = null;
    const queryFilterParts: string[] = [];
    const queryExpressionAttributeNames: Record<string, string> = {
      '#dept': 'department',
    };
    const queryExpressionAttributeValues: Record<string, unknown> = {};

    if (beforeDate) {
      queryExpressionAttributeNames['#endDate'] = 'endDate';
      queryExpressionAttributeValues[':beforeDate'] = beforeDate;
      queryFilterParts.push('#endDate < :beforeDate');
    }
    if (afterDate) {
      queryExpressionAttributeNames['#startDate'] = 'startDate';
      queryExpressionAttributeValues[':afterDate'] = afterDate;
      queryFilterParts.push('#startDate > :afterDate');
    }

    // Query directly when scoped to a single department.
    if (departmentsToQuery.length === 1) {
      if (typeof parsedLastKey !== 'undefined' && !isInvoiceCursorKey(parsedLastKey)) {
        return [
          400,
          generateApi400Body([ 'lastKey', ]),
        ];
      }

      const singleDepartmentLastKey = parsedLastKey as InvoiceCursorKey | undefined;
      if (
        singleDepartmentLastKey &&
        singleDepartmentLastKey.department !== departmentsToQuery[0]
      ) {
        return [
          400,
          generateApi400Body([ 'lastKey', ]),
        ];
      }

      const expressionAttributeNames: Record<string, string> = {
        ...queryExpressionAttributeNames,
      };
      const expressionAttributeValues: Record<string, unknown> = {
        ...queryExpressionAttributeValues,
        ':dept': departmentsToQuery[0],
      };

      const queryInput: TypedQueryInput<Invoice> = {
        TableName: TABLE_INVOICE(),
        IndexName: 'departmentIndex',
        KeyConditionExpression: '#dept = :dept',
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: singleDepartmentLastKey,
      };

      if (queryFilterParts.length > 0) {
        queryInput.FilterExpression = queryFilterParts.join(' AND ');
      }

      const queryResult = await typedQuery<Invoice>(queryInput);
      allInvoices = queryResult.Items || [];
      finalLastKey = queryResult.LastEvaluatedKey;
      responseLastItem = finalLastKey
        ? Buffer.from(JSON.stringify(finalLastKey)).toString('base64')
        : null;
    } else if (departmentsToQuery.length > 1) {
      if (
        typeof parsedLastKey !== 'undefined' &&
        !isMultiDepartmentCursor(parsedLastKey, departmentsToQuery)
      ) {
        return [
          400,
          generateApi400Body([ 'lastKey', ]),
        ];
      }

      const multiCursor = parsedLastKey as MultiDepartmentCursor | undefined;
      const queryResults = await Promise.all(departmentsToQuery.map(async department => {
        const queryInput: TypedQueryInput<Invoice> = {
          TableName: TABLE_INVOICE(),
          IndexName: 'departmentIndex',
          KeyConditionExpression: '#dept = :dept',
          ExpressionAttributeNames: {
            ...queryExpressionAttributeNames,
          },
          ExpressionAttributeValues: {
            ...queryExpressionAttributeValues,
            ':dept': department,
          },
          ScanIndexForward: false,
          Limit: limit,
          ExclusiveStartKey: multiCursor?.departmentKeys[department] || undefined,
        };

        if (queryFilterParts.length > 0) {
          queryInput.FilterExpression = queryFilterParts.join(' AND ');
        }

        return {
          department,
          result: await typedQuery<Invoice>(queryInput),
        };
      }));

      const mergedInvoices = queryResults
        .flatMap(v => v.result.Items || [])
        .sort((a, b) => {
          const aDate = typeof a.generatedDate === 'string' ? a.generatedDate : '';
          const bDate = typeof b.generatedDate === 'string' ? b.generatedDate : '';
          if (aDate === bDate) {
            return a.id.localeCompare(b.id);
          }
          return bDate.localeCompare(aDate);
        });

      allInvoices = mergedInvoices.slice(0, limit);

      const consumedByDepartment = allInvoices.reduce<Record<string, number>>((acc, invoice) => {
        if (typeof invoice.department === 'string') {
          acc[invoice.department] = (acc[invoice.department] || 0) + 1;
        }
        return acc;
      }, {});

      const nextDepartmentKeys: Record<string, InvoiceCursorKey | null> = {};
      let hasMore = false;

      for (const {
        department,
        result,
      } of queryResults) {
        const items = result.Items || [];
        const consumed = consumedByDepartment[department] || 0;
        const currentStartKey = multiCursor?.departmentKeys[department] || null;

        if (consumed <= 0) {
          nextDepartmentKeys[department] = currentStartKey;
          if (items.length > 0 || result.LastEvaluatedKey) {
            hasMore = true;
          }
          continue;
        }

        if (consumed >= items.length) {
          const nextKey = isInvoiceCursorKey(result.LastEvaluatedKey)
            ? result.LastEvaluatedKey
            : null;
          nextDepartmentKeys[department] = nextKey;
          if (nextKey) {
            hasMore = true;
          }
          continue;
        }

        const resumeKey = getInvoiceCursorKey(items[consumed - 1]);
        nextDepartmentKeys[department] = resumeKey;
        if (resumeKey) {
          hasMore = true;
        }
      }

      responseLastItem = hasMore
        ? Buffer.from(JSON.stringify({
          mode: 'multi',
          departmentKeys: nextDepartmentKeys,
        })).toString('base64')
        : null;
    } else {
      if (typeof parsedLastKey !== 'undefined' && !isScanCursorKey(parsedLastKey)) {
        return [
          400,
          generateApi400Body([ 'lastKey', ]),
        ];
      }

      const scanCursor = parsedLastKey as ScanCursorKey | undefined;
      const scanFilterParts: string[] = [];
      const scanExpressionAttributeNames: Record<string, string> = {};
      const scanExpressionAttributeValues: Record<string, unknown> = {};

      if (beforeDate) {
        scanExpressionAttributeNames['#endDate'] = 'endDate';
        scanExpressionAttributeValues[':beforeDate'] = beforeDate;
        scanFilterParts.push('#endDate < :beforeDate');
      }
      if (afterDate) {
        scanExpressionAttributeNames['#startDate'] = 'startDate';
        scanExpressionAttributeValues[':afterDate'] = afterDate;
        scanFilterParts.push('#startDate > :afterDate');
      }

      const scanResult = await typedScan<Invoice>({
        TableName: TABLE_INVOICE(),
        Limit: limit,
        ExclusiveStartKey: scanCursor,
        ...scanFilterParts.length > 0
          ? {
            FilterExpression: scanFilterParts.join(' AND '),
            ExpressionAttributeNames: scanExpressionAttributeNames,
            ExpressionAttributeValues: scanExpressionAttributeValues,
          }
          : {},
      });

      allInvoices = scanResult.Items || [];
      finalLastKey = scanResult.LastEvaluatedKey;
      responseLastItem = finalLastKey
        ? Buffer.from(JSON.stringify(finalLastKey)).toString('base64')
        : null;
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
        lastItem: responseLastItem,
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
