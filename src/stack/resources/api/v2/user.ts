import { getLogger } from '../../../../logic/logger';
import { checkObject, getCurrentUser, getFrontendUserObj, handleResourceApi, LambdaApiFunction, validateRequest } from './_base';
import { adminUserKeys, DeleteUserApi, districtAdminUserKeys, FullUserObject, GetUserApi, UpdateUserApi, updateUserApiBodyValidator, userApiDeleteParamsValidator, userApiParamsValidator, validDepartments } from '@/types/api/users';
import { api200Body, api401Body, api403Body, api404Body, generateApi400Body } from '@/types/api/_shared';
import { TABLE_USER, typedDeleteItem, typedGet, typedUpdate } from '@/stack/utils/dynamoTyped';
import { TypedUpdateInput } from '@/types/backend/dynamo';

const logger = getLogger('users');

const GET: LambdaApiFunction<GetUserApi> = async function (event) {
  logger.debug('GET', ...arguments);

  // Authorize the user
  const [ user, userPerms, userHeaders ] = await getCurrentUser(event);
  if (user === null) return [ 401, api401Body, userHeaders ];
  const [ params, paramsErrors ] = checkObject<GetUserApi['params']>(
    event.pathParameters,
    userApiParamsValidator,
  );
  if (
    params === null ||
    paramsErrors.length > 0
  )
    return [
      400,
      generateApi400Body(paramsErrors),
      userHeaders,
    ];

  if (typeof params.id === 'string') {
    return [
      200,
      getFrontendUserObj(user),
      userHeaders,
    ];
  }
  if (!userPerms.isAdmin) {
    return [ 403, api403Body, userHeaders ];
  }

  // Fetch the user
  const userInfo = await typedGet<FullUserObject>({
    TableName: TABLE_USER,
    Key: {
      phone: params.id,
    },
  });
  if (!userInfo.Item)
    return [ 404, api404Body, userHeaders ];

  return [
    200,
    getFrontendUserObj(userInfo.Item),
    userHeaders,
  ];
}

const PATCH: LambdaApiFunction<UpdateUserApi> = async function (event) {
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
    ]
  }

  // Authorize the user
  const [ user, userPerms, userHeaders ] = await getCurrentUser(event);
  if (user === null) return [ 401, api401Body, userHeaders ];
  const updateType = typeof params.id === 'string'
    ? 'SELF'
    : 'OTHER';
  if (
    !userPerms.isAdmin &&
    updateType === 'OTHER'
  )
    return [ 403, api403Body, userHeaders ];

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
      return [ 404, api404Body, userHeaders ];
    }

    if (
      !user.isDistrictAdmin &&
      !userPerms.adminDepartments.some(dep => userToEdit.Item?.[dep]?.active)
    ) {
      return [ 403, api403Body, userHeaders ];
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
          updateConfig.ExpressionAttributeNames = {
            ...(updateConfig.ExpressionAttributeNames || {}),
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
    logger.error(`Failed to update user`, body, updateResult);
    throw new Error(`Failed to create user`);
  }

  return [
    200,
    getFrontendUserObj(updateResult.Attributes as FullUserObject),
    userHeaders,
  ];
}

const DELETE: LambdaApiFunction<DeleteUserApi> = async function (event) {
  logger.trace('DELETE', ...arguments);

  // Make sure the path parameter is valid
  const [ params, paramsErrors ] = checkObject(
    event.pathParameters,
    userApiDeleteParamsValidator,
  );
  if (
    params === null ||
    paramsErrors.length > 0
  ) {
    return [ 404, api404Body ];
  }

  // Authorize the user
  const [ user, userPerms, userHeaders ] = await getCurrentUser(event);
  if (user === null) return [ 401, api401Body, userHeaders ];
  if (!userPerms.isAdmin) {
    return [ 403, api403Body, userHeaders ];
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
    return [ 404, api404Body, userHeaders ];
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
    return [ 403, api403Body, userHeaders ];
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
    userHeaders,
  ];
}

export const main = handleResourceApi.bind(null, {
  GET,
  PATCH,
  DELETE,
});
