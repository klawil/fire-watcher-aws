import {
  SQSClient,
  SendMessageCommand
} from '@aws-sdk/client-sqs';

import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';
import {
  getFrontendUserObj, parseJsonBody
} from './_utils';

import {
  api401Body, api403Body, generateApi400Body
} from '@/types/api/_shared';
import {
  CreateUserApi, FrontendUserObject, FullUserObject, GetAllUsersApi, createUserApiBodyValidator
} from '@/types/api/users';
import {
  TypedPutItemInput, TypedScanInput
} from '@/types/backend/dynamo';
import { ActivateUserQueueItem } from '@/types/backend/queue';
import {
  ExceptSpecificKeys, OnlySpecificKeys
} from '@/types/utility';
import {
  TABLE_USER, typedPutItem, typedScan
} from '@/utils/backend/dynamoTyped';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('users');
const sqs = new SQSClient();
const queueUrl = process.env.SQS_QUEUE;

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
    name: 'getTranscriptOnly',
  },
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

const GET: LambdaApiFunction<GetAllUsersApi> = async function (event, user, userPerms) {
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

  // Get the keys that should be returned
  const scanInput: TypedScanInput<FullUserObject> = {
    TableName: TABLE_USER,
  };
  if (!user.isDistrictAdmin) {
    userPerms.adminDepartments.forEach(dep => {
      scanInput.ExpressionAttributeNames = scanInput.ExpressionAttributeNames || {};
      scanInput.ExpressionAttributeNames = {
        ...scanInput.ExpressionAttributeNames || {},
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
    scanResult.Items || [],
  ];
};

const POST: LambdaApiFunction<CreateUserApi> = async function (event, user, userPerms) {
  logger.trace('POST', ...arguments);

  // Parse the body
  const [
    body,
    errorKeys,
  ] = parseJsonBody<CreateUserApi['body']>(
    event.body,
    createUserApiBodyValidator
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

  // Validate the user keys and build the insert
  const putConfig: TypedPutItemInput<FullUserObject> = {
    TableName: TABLE_USER,
    Item: {
      phone: body.phone,
    },
  };
  [
    ...createUserKeys,
    ...user.isDistrictAdmin ? districtAdminUserKeys : [],
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
    return [
      400,
      generateApi400Body(errorKeys),
    ];
  }

  // Run the actual update
  await typedPutItem(putConfig);

  // Send the queue message
  const queueMessage: ActivateUserQueueItem = {
    action: 'activate-user',
    phone: body.phone,
    department: body.department,
  };
  await sqs.send(new SendMessageCommand({
    MessageBody: JSON.stringify(queueMessage),
    QueueUrl: queueUrl,
  }));

  // Return the safed user object
  const returnBody = getFrontendUserObj(putConfig.Item);
  return [
    200,
    returnBody,
  ];
};

export const main = handleResourceApi.bind(null, {
  GET,
  POST,
});
