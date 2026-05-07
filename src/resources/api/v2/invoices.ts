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

  const departmentsParam = query.departments;
  const beforeDate = query.before;
  const afterDate = query.after;
  const lastKeyParam = query.lastKey;

  // Parse limit and lastKey
  const limit = typeof query.limit === 'number'
    ? Math.min(query.limit, 100)
    : 50;
  let lastKey: Record<string, string> | undefined;
  if (lastKeyParam) {
    try {
      lastKey = JSON.parse(Buffer.from(lastKeyParam, 'base64').toString()) as Record<string, string>;
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
    departmentsToQuery = departmentsParam.split(',').map(d => d.trim());

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
    let finalLastKey = lastKey;

    if (departmentsToQuery.length === 0) {
      // District admin with no departments specified - scan all
      const scanResult = await typedScan<Invoice>({
        TableName: TABLE_INVOICE(),
        Limit: limit,
        ExclusiveStartKey: lastKey,
      });

      allInvoices = scanResult.Items || [];
      finalLastKey = scanResult.LastEvaluatedKey;
    } else {
      // Query specific departments
      for (const dept of departmentsToQuery) {
        const queryInput: TypedQueryInput<Invoice> = {
          TableName: TABLE_INVOICE(),
          IndexName: 'departmentIndex',
          KeyConditionExpression: '#dept = :dept',
          ExpressionAttributeNames: {
            '#dept': 'department',
          },
          ExpressionAttributeValues: {
            ':dept': dept,
          },
          ScanIndexForward: false, // Most recent first
        };

        // Add date filters if provided
        if (beforeDate) {
          queryInput.KeyConditionExpression += ' AND #endDate < :beforeDate';
          queryInput.ExpressionAttributeNames = queryInput.ExpressionAttributeNames || {};
          queryInput.ExpressionAttributeValues = queryInput.ExpressionAttributeValues || {};
          queryInput.ExpressionAttributeNames['#endDate'] = 'endDate';
          queryInput.ExpressionAttributeValues[':beforeDate'] = beforeDate;
        }
        if (afterDate) {
          queryInput.KeyConditionExpression += ' AND #startDate > :afterDate';
          queryInput.ExpressionAttributeNames = queryInput.ExpressionAttributeNames || {};
          queryInput.ExpressionAttributeValues = queryInput.ExpressionAttributeValues || {};
          queryInput.ExpressionAttributeNames['#startDate'] = 'startDate';
          queryInput.ExpressionAttributeValues[':afterDate'] = afterDate;
        }

        const queryResult = await typedQuery<Invoice>(queryInput);
        allInvoices.push(...queryResult.Items || []);
      }

      // Sort combined results by generated date descending
      allInvoices.sort((a, b) => {
        const aDate = new Date(a.generatedDate || '').getTime();
        const bDate = new Date(b.generatedDate || '').getTime();
        return bDate - aDate;
      });

      // Handle pagination - just take the limit
      finalLastKey = allInvoices.length > limit ? { id: allInvoices[limit - 1].id, } : undefined;
      allInvoices = allInvoices.slice(0, limit);
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
