import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';
import {
  getFrontendUserObj, validateRequest
} from './_utils';

import {
  api200Body, api401Body, api403Body, api404Body, generateApi400Body
} from '@/types/api/_shared';
import {
  DeleteUserApi, FullUserObject, GetUserApi, UpdateUserApi, adminUserKeys, districtAdminUserKeys,
  updateUserApiBodyValidator, userApiDeleteParamsValidator, userApiParamsValidator, validDepartments
} from '@/types/api/users';
import { TypedUpdateInput } from '@/types/backend/dynamo';
import {
  TABLE_USER, typedDeleteItem, typedGet, typedUpdate
} from '@/utils/backend/dynamoTyped';
import { validateObject } from '@/utils/backend/validation';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('users');

const GET: LambdaApiFunction<GetUserApi> = async function (event, user, userPerms) {
  logger.debug('GET', ...arguments);

  // Authorize the user
  if (user === null) {
    return [
      401,
      api401Body,
    ];
  }
  const [
    params,
    paramsErrors,
  ] = validateObject<GetUserApi['params']>(
    event.pathParameters,
    userApiParamsValidator
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

  if (typeof params.id === 'string') {
    return [
      200,
      getFrontendUserObj(user),
    ];
  }
  if (!userPerms.isAdmin) {
    return [
      403,
      api403Body,
    ];
  }

  // Fetch the user
  const userInfo = await typedGet<FullUserObject>({
    TableName: TABLE_USER,
    Key: {
      phone: params.id,
    },
  });
  if (!userInfo.Item) {
    return [
      404,
      api404Body,
    ];
  }

  return [
    200,
    getFrontendUserObj(userInfo.Item),
  ];
};

const PATCH: LambdaApiFunction<UpdateUserApi> = async function (event, user, userPerms) {
  logger.debug('GET', ...arguments);

  // Validate the path params and body
  const {
    params,
    body,
    validationErrors,
  } = validateRequest<UpdateUserApi>({
    paramsRaw: event.pathParameters,
    paramsValidator: userApiParamsValidator,
    bodyRaw: event.body,
    bodyParser: 'json',
    bodyValidator: updateUserApiBodyValidator,
  });
  if (
    params === null ||
    body === null ||
    Object.keys(body).length === 0 ||
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
  const updateType = typeof params.id === 'string'
    ? 'SELF'
    : 'OTHER';
  if (
    !userPerms.isAdmin &&
    updateType === 'OTHER'
  ) {
    return [
      403,
      api403Body,
    ];
  }

  // Validate the user exists and can be edited by the authenticated user
  const phoneToUpdate = updateType === 'SELF'
    ? user.phone
    : params.id as number;
  if (updateType === 'OTHER') {
    // Get the user being edited
    const userToEdit = await typedGet<FullUserObject>({
      TableName: TABLE_USER,
      Key: {
        phone: phoneToUpdate,
      },
    });
    if (!userToEdit.Item) {
      return [
        404,
        api404Body,
      ];
    }

    if (
      !user.isDistrictAdmin &&
      !userPerms.adminDepartments.some(dep => userToEdit.Item?.[dep]?.active)
    ) {
      return [
        403,
        api403Body,
      ];
    }
  }

  // Update the user record
  const updateStrings: string[] = [];
  const deleteStrings: string[] = [];
  const updateConfig: TypedUpdateInput<FullUserObject> = {
    TableName: TABLE_USER,
    Key: {
      phone: phoneToUpdate,
    },
    ExpressionAttributeNames: {},
    UpdateExpression: '',
    ReturnValues: 'ALL_NEW',
  };
  (user.isDistrictAdmin ? districtAdminUserKeys : adminUserKeys)
    .forEach(keyRaw => {
      if (keyRaw in body && keyRaw !== 'phone') {
        const key = keyRaw as keyof typeof body;
        updateConfig.ExpressionAttributeNames = {
          ...updateConfig.ExpressionAttributeNames,
          [`#${key}`]: key,
        };
        if (body[key as keyof typeof body] === null) {
          deleteStrings.push(`#${key}`);
        } else {
          updateConfig.ExpressionAttributeValues = {
            ...updateConfig.ExpressionAttributeValues || {},
            [`:${key}`]: body[key],
          };
          updateStrings.push(`#${key} = :${key}`);
        }
      }
    });
  if (deleteStrings.length > 0) {
    updateConfig.UpdateExpression = `REMOVE ${deleteStrings.join(', ')}`;
  }
  if (updateStrings.length > 0) {
    if (deleteStrings.length > 0) {
      updateConfig.UpdateExpression += ' ';
    }
    updateConfig.UpdateExpression += `SET ${updateStrings.join(', ')}`;
  }
  const updateResult = await typedUpdate<FullUserObject>(updateConfig);
  if (!updateResult.Attributes) {
    logger.error('Failed to update user', body, updateResult);
    throw new Error('Failed to create user');
  }

  return [
    200,
    getFrontendUserObj(updateResult.Attributes as FullUserObject),
  ];
};

const DELETE: LambdaApiFunction<DeleteUserApi> = async function (event, user, userPerms) {
  logger.trace('DELETE', ...arguments);

  // Make sure the path parameter is valid
  const [
    params,
    paramsErrors,
  ] = validateObject(
    event.pathParameters,
    userApiDeleteParamsValidator
  );
  if (
    params === null ||
    paramsErrors.length > 0
  ) {
    return [
      404,
      api404Body,
    ];
  }

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

  // Validate the user exists
  const phoneToDelete = params.id;
  const changeUserGet = await typedGet<FullUserObject>({
    TableName: TABLE_USER,
    Key: {
      phone: phoneToDelete,
    },
  });
  if (!changeUserGet.Item) {
    return [
      403,
      api403Body,
    ];
  }
  const changeUser = changeUserGet.Item;

  // Validate the logged in user has the correct permissions
  const changeUserDepartments = validDepartments
    .filter(dep => typeof changeUser[dep] !== 'undefined');
  if (
    !user.isDistrictAdmin &&
    changeUserDepartments
      .filter(dep => !userPerms.adminDepartments.includes(dep))
      .length > 0
  ) {
    return [
      403,
      api403Body,
    ];
  }

  // Delete the user
  await typedDeleteItem<FullUserObject>({
    TableName: TABLE_USER,
    Key: {
      phone: phoneToDelete,
    },
  });

  return [
    200,
    api200Body,
  ];
};

export const main = handleResourceApi.bind(null, {
  GET,
  PATCH,
  DELETE,
});
