import {
  SQSClient,
  SendMessageCommand
} from '@aws-sdk/client-sqs';

import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';
import {
  getFrontendUserObj, validateRequest
} from './_utils';

import {
  api401Body, api403Body, api404Body, api500Body, generateApi400Body
} from '@/types/api/_shared';
import {
  CreateUserDepartmentApi, DeleteUserDepartmentApi, FullUserObject,
  createUserDepartmentApiBodyValidator, userDepartmentApiParamsValidator
} from '@/types/api/users';
import {
  QUEUE_EVENTS, TABLE_USER
} from '@/types/backend/environment';
import { ActivateUserQueueItem } from '@/types/backend/queue';
import {
  typedGet, typedUpdate
} from '@/utils/backend/dynamoTyped';
import { validateObject } from '@/utils/backend/validation';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('userDepartment');
const sqs = new SQSClient();

const POST: LambdaApiFunction<CreateUserDepartmentApi> = async function (event, user, userPerms) {
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
  if (
    !userPerms.isDistrictAdmin &&
    !userPerms.adminDepartments.includes(departmentToEdit)
  ) {
    return [
      403,
      api403Body,
    ];
  }

  // Make sure the phone exists
  const currentUser = await typedGet<FullUserObject>({
    TableName: TABLE_USER(),
    Key: {
      phone: phoneToEdit,
    },
  });
  if (!currentUser.Item) {
    return [
      404,
      api404Body,
    ];
  }

  // Build the update
  const currentDepConfig: NonNullable<FullUserObject['departments']>[number] =
    currentUser.Item.departments?.find(d => d.id === departmentToEdit) || {
      id: departmentToEdit,
    };
  if (typeof body.active !== 'undefined') {
    currentDepConfig.active = body.active === null ? undefined : body.active;
  }
  if (typeof body.admin !== 'undefined') {
    currentDepConfig.admin = body.admin === null ? undefined : body.admin;
  }
  if (typeof body.callSign !== 'undefined') {
    currentDepConfig.callSign = body.callSign === null ? undefined : body.callSign;
  }
  const newDepartments = [
    ...currentUser.Item.departments?.filter(d => d.id !== departmentToEdit) || [],
    currentDepConfig,
  ];
  const updateResult = await typedUpdate<FullUserObject>({
    TableName: TABLE_USER(),
    Key: {
      phone: phoneToEdit,
    },
    ExpressionAttributeNames: {
      '#departments': 'departments',
    },
    ExpressionAttributeValues: {
      ':departments': newDepartments,
    },
    UpdateExpression: 'SET #departments = :departments',
    ReturnValues: 'ALL_NEW',
  });
  if (!updateResult.Attributes) {
    return [
      500,
      api500Body,
    ];
  }

  // Send the activation message (if needed)
  if (
    !currentUser.Item.departments?.find(d => d.id === departmentToEdit)?.active &&
    body.active
  ) {
    const queueMessage: ActivateUserQueueItem = {
      action: 'activate-user',
      phone: phoneToEdit,
      department: departmentToEdit,
    };
    await sqs.send(new SendMessageCommand({
      MessageBody: JSON.stringify(queueMessage),
      QueueUrl: QUEUE_EVENTS(),
    }));
  }

  // Return the result
  return [
    200,
    getFrontendUserObj(updateResult.Attributes as FullUserObject),
  ];
};

const DELETE: LambdaApiFunction<DeleteUserDepartmentApi> = async function (event, user, userPerms) {
  logger.trace('POST', ...arguments);

  // Validate the parameters
  const [
    params,
    paramsErrors,
  ] = validateObject<CreateUserDepartmentApi['params']>(
    event.pathParameters,
    userDepartmentApiParamsValidator
  );
  if (
    params === null ||
    paramsErrors.length > 0
  ) {
    return [
      400,
      generateApi400Body(paramsErrors),
      {},
    ];
  }

  // Authorize the user
  const phoneToEdit = params.id;
  const departmentToEdit = params.department;
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
  if (
    !userPerms.isDistrictAdmin &&
    !userPerms.adminDepartments.includes(departmentToEdit)
  ) {
    return [
      403,
      api403Body,
    ];
  }

  // Get the user so we know which department index to delete
  const userToEdit = await typedGet<FullUserObject>({
    TableName: TABLE_USER(),
    Key: {
      phone: phoneToEdit,
    },
  });
  if (!userToEdit.Item) {
    return [
      404,
      api404Body,
    ];
  }

  const newDepartments = userToEdit.Item.departments?.filter(d => d.id !== departmentToEdit) || [];

  // Run the deletion of the department
  if (newDepartments.length !== userToEdit.Item.departments?.length || 0) {
    const result = await typedUpdate<FullUserObject>({
      TableName: TABLE_USER(),
      Key: {
        phone: phoneToEdit,
      },
      ExpressionAttributeNames: {
        '#departments': 'departments',
      },
      UpdateExpression: newDepartments.length > 0
        ? 'SET #departments = :departments'
        : 'REMOVE #departments',
      ReturnValues: 'ALL_NEW',
      ...newDepartments.length > 0
        ? {
          ExpressionAttributeValues: {
            ':departments': newDepartments,
          },
        }
        : {},
    });
    if (!result.Attributes) {
      return [
        500,
        api500Body,
      ];
    }
    return [
      200,
      getFrontendUserObj(result.Attributes as FullUserObject),
    ];
  }

  return [
    200,
    getFrontendUserObj(userToEdit.Item),
  ];
};

export const main = handleResourceApi.bind(null, {
  POST,
  PATCH: POST,
  DELETE,
});
