import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';
import { validateRequest } from './_utils';

import {
  api401Body, api403Body,
  api404Body,
  generateApi400Body
} from '@/types/api/_shared';
import {
  Department,
  GetDepartmentApi,
  UpdateDepartmentApi,
  departmentApiParamsValidator,
  updateDepartmentApiBodyValidator
} from '@/types/api/departments';
import { TypedUpdateInput } from '@/types/backend/dynamo';
import {
  TABLE_DEPARTMENT, typedGet,
  typedUpdate
} from '@/utils/backend/dynamoTyped';
import { validateObject } from '@/utils/backend/validation';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('api/v2/department');

const GET: LambdaApiFunction<GetDepartmentApi> = async function (event, user, userPerms) {
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
  const [
    params,
    paramsErrors,
  ] = validateObject<GetDepartmentApi['params']>(
    event.pathParameters,
    departmentApiParamsValidator
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
  if (
    !userPerms.adminDepartments.includes(params.id as typeof userPerms.adminDepartments[number]) &&
    !user.isDistrictAdmin
  ) {
    return [
      403,
      api403Body,
    ];
  }

  // Fetch the department
  const departmentInfo = await typedGet<Department>({
    TableName: TABLE_DEPARTMENT,
    Key: {
      id: params.id,
    },
  });
  if (!departmentInfo.Item) {
    return [
      404,
      api404Body,
    ];
  }

  return [
    200,
    departmentInfo.Item,
  ];
};

const PATCH: LambdaApiFunction<UpdateDepartmentApi> = async function (event, user, userPerms) {
  logger.debug('PATCH', ...arguments);

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

  // Validate the request
  const {
    params,
    body,
    validationErrors,
  } = validateRequest<UpdateDepartmentApi>({
    paramsRaw: event.pathParameters,
    paramsValidator: departmentApiParamsValidator,
    bodyRaw: event.body,
    bodyParser: 'json',
    bodyValidator: updateDepartmentApiBodyValidator,
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

  // Finish authorizing the user
  if (
    !userPerms.adminDepartments.includes(params.id as typeof userPerms.adminDepartments[number]) &&
    !user.isDistrictAdmin
  ) {
    return [
      403,
      api403Body,
    ];
  }

  // Fetch the department
  const departmentInfo = await typedGet<Department>({
    TableName: TABLE_DEPARTMENT,
    Key: {
      id: params.id,
    },
  });
  if (!departmentInfo.Item) {
    return [
      404,
      api404Body,
    ];
  }

  // Update the department
  const updateConfig: TypedUpdateInput<Department> = {
    TableName: TABLE_DEPARTMENT,
    Key: {
      id: params.id,
    },
    ExpressionAttributeNames: {},
    ExpressionAttributeValues: {},
    UpdateExpression: '',
    ReturnValues: 'ALL_NEW',
  };
  const updateStrings: string[] = [];
  Object.keys(body).forEach(key => {
    updateConfig.ExpressionAttributeNames[`#${key}`] = key;
    updateConfig.ExpressionAttributeValues = updateConfig.ExpressionAttributeValues || {};
    updateConfig.ExpressionAttributeValues[`:${key}`] = body[key as keyof typeof body];
    updateStrings.push(`#${key} = :${key}`);
  });
  if (updateStrings.length > 0) {
    updateConfig.UpdateExpression = `SET ${updateStrings.join(', ')}`;
  } else {
    // No updates to make
    return [
      200,
      departmentInfo.Item,
    ];
  }

  const updateResult = await typedUpdate(updateConfig);
  if (!updateResult.Attributes) {
    logger.error('Failed to update department', body, updateResult);
    throw new Error('Failed to update department');
  }

  return [
    200,
    updateResult.Attributes as Department,
  ];
};

export const main = handleResourceApi.bind(null, {
  GET,
  PATCH,
});
