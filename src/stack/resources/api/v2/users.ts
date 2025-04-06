import * as AWS from 'aws-sdk';
import { getLogger } from '../../../../logic/logger';
import { getCurrentUser, getFrontendUserObj, handleResourceApi, LambdaApiFunction, parseJsonBody } from './_base';
import { CreateUserApi, createUserApiBodyValidator, FrontendUserObject, FullUserObject, GetAllUsersApi } from '@/types/api/users';
import { api401Body, api403Body, generateApi400Body } from '@/types/api/_shared';
import { ActivateBody } from '../../types/queue';
import { TABLE_USER, typedPutItem, typedScan } from '@/stack/utils/dynamoTyped';
import { TypedPutItemInput, TypedScanInput } from '@/types/backend/dynamo';
import { ExceptSpecificKeys, OnlySpecificKeys } from '@/types/utility';

const logger = getLogger('users');
const sqs = new AWS.SQS();
const queueUrl = process.env.QUEUE_URL as string;

type EditKeyConfig = {
  name: OnlySpecificKeys<keyof CreateUserApi['body'], keyof FrontendUserObject>;
} | {
  name: ExceptSpecificKeys<keyof CreateUserApi['body'], keyof FrontendUserObject>;
  partOfDepartment: true;
};
const createUserKeys: EditKeyConfig[] = [
  {
		name: 'phone',
  },
  {
    name: 'fName',
  },
  {
    name: 'lName',
  },
  {
    name: 'department',
    partOfDepartment: true,
  },
  {
    name: 'admin',
		partOfDepartment: true,
  },
  {
    name: 'callSign',
		partOfDepartment: true,
  },
  {
    name: 'talkgroups',
  },
  {
    name: 'getTranscript',
  },
];
const districtAdminUserKeys: EditKeyConfig[] = [
  {
    name: 'getApiAlerts',
  },
  {
    name: 'getVhfAlerts',
  },
  {
    name: 'getDtrAlerts',
  },
  {
    name: 'isDistrictAdmin',
  },
  {
    name: 'pagingPhone',
  },
];

const GET: LambdaApiFunction<GetAllUsersApi> = async function (event) {
  logger.debug('GET', ...arguments);

  // Authorize the user
  const [ user, userPerms, userHeaders ] = await getCurrentUser(event);
  if (user === null) return [ 401, api401Body, userHeaders ];
  if (!userPerms.isAdmin) return [ 403, api403Body, userHeaders ];

  // Get the keys that should be returned
  const scanInput: TypedScanInput<FullUserObject> = {
    TableName: TABLE_USER,
  };
  if (!user.isDistrictAdmin) {
    userPerms.adminDepartments.forEach(dep => {
      scanInput.ExpressionAttributeNames = scanInput.ExpressionAttributeNames || {};
      scanInput.ExpressionAttributeNames = {
        ...(scanInput.ExpressionAttributeNames || {}),
        [`#${dep}`]: dep,
      };
    });
    scanInput.FilterExpression = userPerms.adminDepartments
      .map(dep => `attribute_exists(#${dep})`).join(' OR ');
  }

  // Fetch, sort, and return the items
  const scanResult = await typedScan<FullUserObject>(scanInput);
  if (scanResult.Items) {
    scanResult.Items
      .map(item => getFrontendUserObj(item))
      .sort((a, b) => `${a.lName}, ${a.fName}`.localeCompare(`${b.lName}, ${b.fName}`));
  }

  return [
    200,
    (scanResult.Items || []),
    userHeaders,
  ];
}

const POST: LambdaApiFunction<CreateUserApi> = async function (event) {
  logger.trace('POST', ...arguments);

  // Parse the body
  const [ body, errorKeys ] = parseJsonBody<CreateUserApi['body']>(
    event.body,
    createUserApiBodyValidator,
  );
  if (
    body === null ||
    errorKeys.length > 0
  ) {
    return [ 400, generateApi400Body(errorKeys) ];
  }

  // Authorize the user
  const [ user, userPerms, userHeaders ] = await getCurrentUser(event);
  if (user === null) return [ 401, api401Body, userHeaders ];
  if (!userPerms.isAdmin) return [ 403, api403Body, userHeaders ];

  // Validate the user keys and build the insert
  const putConfig: TypedPutItemInput<FullUserObject> = {
    TableName: TABLE_USER,
    Item: {
      phone: body.phone,
    },
  };
  [
    ...createUserKeys,
    ...(user.isDistrictAdmin ? districtAdminUserKeys : []),
  ].forEach(item => {
    // Pull out the value
    const value = body[item.name];

    // Add to the update item config
    if ('partOfDepartment' in item) {
      const dep = body.department;
      putConfig.Item[dep] = putConfig.Item[dep] || {};
      if (item.name === 'department') {
        putConfig.Item[dep].active = true;
      } else {
        const name = item.name;
        putConfig.Item[dep][name as 'admin'] = body[name] as boolean;
      }
    } else {
      putConfig.Item[item.name as 'fName'] = value as string;
    }
  });
  if (errorKeys.length > 0) {
    return [ 400, generateApi400Body(errorKeys), userHeaders ];
  }

  // Run the actual update
  await typedPutItem(putConfig);

  // Send the queue message
  const queueMessage: ActivateBody = {
    action: 'activate',
    phone: body.phone.toString(),
    department: body.department,
  };
  await sqs.sendMessage({
    MessageBody: JSON.stringify(queueMessage),
    QueueUrl: queueUrl
  }).promise();

  // Return the safed user object
  const returnBody = getFrontendUserObj(putConfig.Item as FullUserObject);
  return [
    200,
    returnBody,
    userHeaders,
  ];
}

export const main = handleResourceApi.bind(null, {
  GET,
  POST,
});
