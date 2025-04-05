import * as AWS from 'aws-sdk';
import { getLogger } from '../../utils/logger';
import { checkObject, getCurrentUser, getFrontendUserObj, handleResourceApi, LambdaApiFunction, TABLE_USER, validateRequest } from './_base';
import { adminUserKeys, DeleteUserApi, districtAdminUserKeys, FullUserObject, GetUserApi, UpdateUserApi, updateUserApiBodyValidator, userApiParamsValidator, validDepartments } from '@/types/api/apiv2/users';
import { api200Body, api401Body, api403Body, api404Body, generateApi400Body } from '@/types/api/apiv2/_shared';

const logger = getLogger('users');
const docClient = new AWS.DynamoDB.DocumentClient({ apiVersion: "2012-08-10" });

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
  const userInfo = await docClient.get({
    TableName: TABLE_USER,
    Key: {
      phone: params.id,
    },
  }).promise();
  if (!userInfo.Item)
    return [ 404, api404Body, userHeaders ];

  return [
    200,
    getFrontendUserObj(userInfo.Item as FullUserObject),
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
    : params.id;
  if (updateType === 'OTHER') {
    // Get the user being edited
    const userToEdit = await docClient.get({
      TableName: TABLE_USER,
      Key: {
        phone: phoneToUpdate,
      },
    }).promise();
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
  const updateConfig: AWS.DynamoDB.DocumentClient.UpdateItemInput & Required<Pick<
    AWS.DynamoDB.DocumentClient.UpdateItemInput,
    'ExpressionAttributeNames'
  >> = {
    TableName: TABLE_USER,
    Key: {
      phone: phoneToUpdate,
    },
    ExpressionAttributeNames: {},
    UpdateExpression: '',
    ReturnValues: 'ALL_NEW',
  };
  (user.isDistrictAdmin ? districtAdminUserKeys : adminUserKeys)
    .forEach(key => {
      if (key in body) {
        updateConfig.ExpressionAttributeNames[`#${key}`] = key;
        if (body[key as keyof typeof body] === null) {
          deleteStrings.push(`#${key}`);
        } else {
          updateConfig.ExpressionAttributeValues = updateConfig.ExpressionAttributeValues || {};
          updateConfig.ExpressionAttributeValues[`:${key}`] = body[key as keyof typeof body];
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
  const updateResult = await docClient.update(updateConfig).promise();
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
    userApiParamsValidator,
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
  const changeUserGet = await docClient.get({
    TableName: TABLE_USER,
    Key: {
      phone: phoneToDelete,
    },
  }).promise();
  if (!changeUserGet.Item) {
    return [ 404, api404Body, userHeaders ];
  }
  const changeUser = changeUserGet.Item as FullUserObject;

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
  await docClient.delete({
    TableName: TABLE_USER,
    Key: {
      phone: phoneToDelete,
    },
  }).promise();

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
