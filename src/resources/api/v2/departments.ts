import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';
import { parseJsonBody } from './_utils';

import {
  api401Body, api403Body,
  generateApi400Body
} from '@/types/api/_shared';
import {
  CreateDepartmentApi,
  Department,
  ListDepartmentApi,
  createDepartmentApiBodyValidator
} from '@/types/api/departments';
import {
  TypedScanInput
} from '@/types/backend/dynamo';
import { TABLE_DEPARTMENT } from '@/types/backend/environment';
import {
  typedGet, typedPutItem, typedScan
} from '@/utils/backend/dynamoTyped';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('api/v2/departments');

const GET: LambdaApiFunction<ListDepartmentApi> = async function (event, user, userPerms) {
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
  if (!userPerms.isDistrictAdmin && userPerms.adminDepartments.length === 0) {
    return [
      403,
      api403Body,
    ];
  }

  // Generate the scan input
  const scanInput: TypedScanInput<Department> = {
    TableName: TABLE_DEPARTMENT,
  };
  if (!user.isDistrictAdmin) {
    const filterExpressionKeys: string[] = [];
    userPerms.adminDepartments.forEach((dep, idx) => {
      const idKey = `:id${idx}`;
      filterExpressionKeys.push(idKey);
      scanInput.ExpressionAttributeValues = {
        ...scanInput.ExpressionAttributeValues,
        [idKey]: dep,
      };
    });
    scanInput.ExpressionAttributeNames = {
      '#id': 'id',
    };
    scanInput.FilterExpression = `#id in (${filterExpressionKeys.join(',')})`;
  }

  // Fetch, sort, and return the results
  const scanResult = await typedScan<Department>(scanInput);
  if (scanResult.Items) {
    scanResult.Items = scanResult.Items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  return [
    200,
    scanResult.Items || [],
  ];
};

const POST: LambdaApiFunction<CreateDepartmentApi> = async function (event, user, userPerms) {
  logger.debug('POST', ...arguments);

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

  // Parse the body
  const [
    body,
    errorKeys,
  ] = parseJsonBody<CreateDepartmentApi['body']>(
    event.body,
    createDepartmentApiBodyValidator
  );
  if (
    body === null ||
    errorKeys.length > 0
  ) {
    return [
      400,
      generateApi400Body(errorKeys),
    ];
  }

  // Confirm the department doesn't already exist
  const getResult = await typedGet<Department>({
    TableName: TABLE_DEPARTMENT,
    Key: {
      id: body.id,
    },
  });
  if (getResult.Item) {
    return [
      400,
      generateApi400Body([ 'id', ]),
    ];
  }

  // Insert the item
  await typedPutItem<Department>({
    TableName: TABLE_DEPARTMENT,
    Item: {
      id: body.id,
      name: body.name,
      pagingTalkgroups: body.pagingTalkgroups,
      type: body.type,
      invoiceFrequency: body.invoiceFrequency,
      invoiceEmail: body.invoiceEmail,
    },
  });

  return [
    200,
    body,
  ];
};

export const main = handleResourceApi.bind(null, {
  GET,
  POST,
});
