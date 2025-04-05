import * as AWS from 'aws-sdk';
import { getLogger } from '../../utils/logger';
import { getCurrentUser, getFrontendUserObj, handleResourceApi, LambdaApiFunction, parseJsonBody, TABLE_USER } from './_base';
import { CreateUserApi, createUserApiBodyValidator, FullUserObject, GetAllUsersApi } from '@/common/apiv2/users';
import { api401Body, api403Body, generateApi400Body } from '@/common/apiv2/_shared';
import { ActivateBody } from '../../types/queue';

const logger = getLogger('users');
const docClient = new AWS.DynamoDB.DocumentClient({ apiVersion: "2012-08-10" });
const sqs = new AWS.SQS();
const queueUrl = process.env.QUEUE_URL as string;

interface EditKeyConfig {
  name: keyof CreateUserApi['body'];
  partOfDepartment?: boolean;
}
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
  const scanInput: AWS.DynamoDB.DocumentClient.ScanInput = {
    TableName: TABLE_USER,
  };
  if (!user.isDistrictAdmin) {
    userPerms.adminDepartments.forEach(dep => {
      scanInput.ExpressionAttributeNames = scanInput.ExpressionAttributeNames || {};
      scanInput.ExpressionAttributeNames[`#${dep}`] = dep;
    });
    scanInput.FilterExpression = userPerms.adminDepartments
      .map(dep => `attribute_exists(#${dep})`).join(' OR ');
  }

  // Fetch, sort, and return the items
  const scanResult = await docClient.scan(scanInput).promise();
  if (scanResult.Items) {
    scanResult.Items
      .map(item => getFrontendUserObj(item as FullUserObject))
      .sort((a, b) => `${a.lName}, ${a.fName}`.localeCompare(`${b.lName}, ${b.fName}`));
  }

  return [
    200,
    (scanResult.Items || []) as GetAllUsersApi['responses'][200],
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
  const putConfig: AWS.DynamoDB.DocumentClient.PutItemInput = {
    TableName: TABLE_USER,
    Item: {},
  };
  [
    ...createUserKeys,
    ...(user.isDistrictAdmin ? districtAdminUserKeys : []),
  ].forEach(item => {
    // Pull out the value
    const value = body[item.name];

    // Add to the update item config
    if (item.partOfDepartment) {
      putConfig.Item[body.department] = putConfig.Item[body.department] || {};
      if (item.name === 'department') {
        putConfig.Item[body.department].active = true;
      } else {
        putConfig.Item[body.department][item.name] = value;
      }
    } else {
      putConfig.Item[item.name] = value;
    }
  });
  if (errorKeys.length > 0) {
    return [ 400, generateApi400Body(errorKeys), userHeaders ];
  }

  // Run the actual update
  await docClient.put(putConfig).promise();

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
