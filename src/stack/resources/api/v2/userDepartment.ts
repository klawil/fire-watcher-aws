import * as AWS from 'aws-sdk';
import { getLogger } from '../../../../logic/logger';
import { checkObject, getCurrentUser, getFrontendUserObj, handleResourceApi, LambdaApiFunction, validateRequest } from './_base';
import { CreateUserDepartmentApi, createUserDepartmentApiBodyValidator, DeleteUserDepartmentApi, FullUserObject, userDepartmentApiParamsValidator } from '@/types/api/users';
import { api401Body, api403Body, api404Body, api500Body, generateApi400Body } from '@/types/api/_shared';
import { ActivateBody } from '../../types/queue';
import { TABLE_USER, typedGet, typedUpdate } from '@/stack/utils/dynamoTyped';

const logger = getLogger('userDepartment');
const sqs = new AWS.SQS();
const queueUrl = process.env.QUEUE_URL as string;

const POST: LambdaApiFunction<CreateUserDepartmentApi> = async function (event) {
  logger.trace('POST', ...arguments);

  // Validate the request
  const {
    params,
    body,
    validationErrors,
  } = validateRequest<CreateUserDepartmentApi>({
    paramsRaw: event.pathParameters,
    paramsValidator: userDepartmentApiParamsValidator,
    bodyRaw: event.body,
    bodyParser: 'json',
    bodyValidator: createUserDepartmentApiBodyValidator,
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
  const phoneToEdit = params.id;
  const departmentToEdit = params.department;
  const [ user, userPerms, userHeaders ] = await getCurrentUser(event);
  if (user === null) return [ 401, api401Body, userHeaders ];
  if (!userPerms.isAdmin) return [ 403, api403Body, userHeaders ];
  if (
    !userPerms.isDistrictAdmin &&
    !userPerms.adminDepartments.includes(departmentToEdit)
  ) return [ 403, api403Body, userHeaders ];

  // Make sure the phone exists
  const currentUser = await typedGet<FullUserObject>({
    TableName: TABLE_USER,
    Key: {
      phone: phoneToEdit,
    },
  });
  if (!currentUser.Item)
    return [ 404, api404Body, userHeaders ];

  // Build the update
  const currentDepConfig = currentUser.Item[departmentToEdit] || {};
  const updateResult = await typedUpdate<FullUserObject>({
    TableName: TABLE_USER,
    Key: {
      phone: phoneToEdit,
    },
    ExpressionAttributeNames: {
      [`#${departmentToEdit}`]: departmentToEdit,
    },
    ExpressionAttributeValues: {
      [`:${departmentToEdit}`]: {
        active: typeof body.active === 'undefined'
          ? currentDepConfig.active || undefined
          : body.active === null ? undefined : body.active,
        admin: typeof body.admin === 'undefined'
          ? currentDepConfig.admin || undefined
          : body.admin === null ? undefined : body.admin,
        callSign: typeof body.callSign === 'undefined'
          ? currentDepConfig.callSign || ''
          : body.callSign,
      },
    },
    UpdateExpression: `SET #${departmentToEdit} = :${departmentToEdit}`,
    ReturnValues: 'ALL_NEW',
  });
  if (!updateResult.Attributes) return [
    500,
    api500Body,
    userHeaders,
  ];

  // Send the activation message (if needed)
  if (
    !currentDepConfig.active &&
    body.active
  ) {
    const queueMessage: ActivateBody = {
      action: 'activate',
      phone: phoneToEdit.toString(),
      department: departmentToEdit,
    };
    await sqs.sendMessage({
      MessageBody: JSON.stringify(queueMessage),
      QueueUrl: queueUrl,
    }).promise();
  }

  // Return the result
  return [
    200,
    getFrontendUserObj(updateResult.Attributes as FullUserObject),
    userHeaders,
  ];
}

const DELETE: LambdaApiFunction<DeleteUserDepartmentApi> = async function (event) {
  logger.trace('POST', ...arguments);

  // Validate the parameters
  const [ params, paramsErrors ] = checkObject<CreateUserDepartmentApi['params']>(
    event.pathParameters,
    userDepartmentApiParamsValidator,
  );
  if (
    params === null ||
    paramsErrors.length > 0
  )
    return [ 400, generateApi400Body(paramsErrors), {} ];

  // Authorize the user
  const phoneToEdit = params.id;
  const departmentToEdit = params.department;
  const [ user, userPerms, userHeaders ] = await getCurrentUser(event);
  if (user === null) return [ 401, api401Body, userHeaders ];
  if (!userPerms.isAdmin) return [ 403, api403Body, userHeaders ];
  if (
    !userPerms.isDistrictAdmin &&
    !userPerms.adminDepartments.includes(departmentToEdit)
  ) return [ 403, api403Body, userHeaders ];

  // Run the deletion of the department
  const result = await typedUpdate<FullUserObject>({
    TableName: TABLE_USER,
    Key: {
      phone: phoneToEdit,
    },
    ExpressionAttributeNames: {
      [`#${departmentToEdit}`]: departmentToEdit,
    },
    UpdateExpression: 'REMOVE #department',
    ReturnValues: 'ALL_NEW',
  });
  if (!result.Attributes) return [
    500,
    api500Body,
    userHeaders,
  ];

  return [
    200,
    getFrontendUserObj(result.Attributes as FullUserObject),
    userHeaders,
  ];
}

export const main = handleResourceApi.bind(null, {
  POST,
  PATCH: POST,
  DELETE,
});
