import CloudWatch from 'aws-sdk/clients/cloudwatch';
import twilio from 'twilio';

import {
  getTwilioSecret, twilioPhoneCategories
} from '@/deprecated/utils/general';
import {
  FullTextObject, TextTypes
} from '@/types/api/texts';
import {
  FullUserObject, PagingTalkgroup, UserDepartment
} from '@/types/api/users';
import { AlertCategory } from '@/types/backend/alerts';
import { PhoneNumberTypes } from '@/types/backend/department';
import {
  TypedScanInput, TypedUpdateInput
} from '@/types/backend/dynamo';
import {
  TABLE_TEXT, TABLE_USER, typedScan, typedUpdate
} from '@/utils/backend/dynamoTyped';
import { getLogger } from '@/utils/common/logger';
import { getUserPermissions } from '@/utils/common/user';

const logger = getLogger('stack/resources/utils/texts');

const cloudWatch = new CloudWatch();
const testUser = Number(process.env.TESTING_USER);

export async function getUserRecipients(
  department: UserDepartment | 'all',
  pageTg: PagingTalkgroup | null,
  isTest: boolean = false
): Promise<FullUserObject[]> {
  logger.trace('getRecipients', ...arguments);

  // Build out the scanning information
  const scanInput: TypedScanInput<FullUserObject> = {
    TableName: TABLE_USER,
  };
  const filterExpressions: string[] = [];
  if (pageTg !== null) {
    scanInput.ExpressionAttributeNames = scanInput.ExpressionAttributeNames || {};
    scanInput.ExpressionAttributeValues = scanInput.ExpressionAttributeValues || {};

    filterExpressions.push('contains(#talkgroups, :talkgroup)');
    scanInput.ExpressionAttributeNames['#talkgroups'] = 'talkgroups';
    scanInput.ExpressionAttributeValues[':talkgroup'] = pageTg;
  }
  if (department !== 'all') {
    scanInput.ExpressionAttributeValues = scanInput.ExpressionAttributeValues || {};

    filterExpressions.push(`#${department}.#active = :active`);
    scanInput.ExpressionAttributeNames = {
      ...scanInput.ExpressionAttributeNames || {},
      [`#${department}`]: department,
      '#active': 'active',
    };
    scanInput.ExpressionAttributeValues[':active'] = true;
  }

  // Handle test pages/notifications/etc
  if (isTest) {
    scanInput.ExpressionAttributeNames = scanInput.ExpressionAttributeNames || {};
    scanInput.ExpressionAttributeValues = scanInput.ExpressionAttributeValues || {};

    filterExpressions.push('#isTest = :isTest');
    scanInput.ExpressionAttributeNames['#isTest'] = 'isTest';
    scanInput.ExpressionAttributeValues[':isTest'] = true;
  }

  // Add the filter expressions to the query
  if (filterExpressions.length > 0) {
    scanInput.FilterExpression = filterExpressions.join(' AND ');
  }

  const result = await typedScan(scanInput);
  const users = result.Items || [];
  if (isTest && !users.some(u => u.phone === testUser)) {
    users.push({
      phone: testUser,
    });
  }

  return users;
}

const messageTypesThatRequireDepartment: TextTypes[] = [
  'department',
  'departmentAnnounce',
  'departmentAlert',
];

export async function saveMessageData(
  messageType: TextTypes,
  messageId: number,
  recipients: number,
  body: string,
  mediaUrls: string[] = [],
  pageId: string | null = null,
  pageTg: PagingTalkgroup | null = null,
  department: UserDepartment | null = null,
  isTest: boolean = false
) {
  logger.trace('saveMessageData', ...arguments);
  if (messageTypesThatRequireDepartment.includes(messageType) && department === null) {
    department = 'PageOnly';
  }
  const promises: Promise<unknown>[] = [];

  // Build the insert/update statement
  const updateItem: TypedUpdateInput<FullTextObject> & Required<Pick<TypedUpdateInput<FullTextObject>, 'ExpressionAttributeValues'>> = {
    TableName: TABLE_TEXT,
    Key: {
      datetime: messageId,
    },
    ExpressionAttributeNames: {
      '#recipients': 'recipients',
      '#body': 'body',
      '#testPageIndex': 'testPageIndex',
      '#isPage': 'isPage',
      '#isTest': 'isTest',
      '#type': 'type',
    },
    ExpressionAttributeValues: {
      ':recipients': recipients,
      ':body': body,
      ':isPage': pageId !== null,
      ':isTest': isTest,
      ':testPageIndex': `${isTest ? 'y' : 'n'}${pageId !== null ? 'y' : 'n'}`,
      ':type': messageType,
    },
  };
  const updateExpressions: string[] = [
    '#recipients = :recipients',
    '#body = :body',
    '#isPage = :isPage',
    '#isTest = :isTest',
    '#testPageIndex = :testPageIndex',
    '#type = :type',
  ];
  if (department !== null) {
    updateItem.ExpressionAttributeNames['#department'] = 'department';
    updateItem.ExpressionAttributeValues[':department'] = department;
    updateExpressions.push('#department = :department');
  }
  if (pageTg !== null) {
    updateItem.ExpressionAttributeNames['#talkgroup'] = 'talkgroup';
    updateItem.ExpressionAttributeValues[':talkgroup'] = pageTg;
    updateExpressions.push('#talkgroup = :talkgroup');
  }
  if (pageId !== null) {
    updateItem.ExpressionAttributeNames['#pageId'] = 'pageId';
    updateItem.ExpressionAttributeValues[':pageId'] = pageId;
    updateExpressions.push('#pageId = :pageId');
  }
  if (mediaUrls.length > 0) {
    updateItem.ExpressionAttributeNames['#mediaUrls'] = 'mediaUrls';
    updateItem.ExpressionAttributeValues[':mediaUrls'] = mediaUrls;
    updateExpressions.push('#mediaUrls = :mediaUrls');
  }
  updateItem.UpdateExpression = `SET ${updateExpressions.join(', ')}`;
  promises.push(typedUpdate<FullTextObject>(updateItem));

  // Add the metric data
  const dataDate = new Date(messageId);
  promises.push(cloudWatch.putMetricData({
    Namespace: 'Twilio Health',
    MetricData: [ {
      MetricName: 'Initiated',
      Timestamp: dataDate,
      Unit: 'Count',
      Value: recipients,
    }, ],
  }).promise()
    .catch(e => logger.error('Error pushing metrics in saveMessageData', e)));

  await Promise.all(promises);
}

export async function sendMessage(
  messageType: TextTypes,
  messageId: number | null,
  phone: number,
  sendNumberCategory: PhoneNumberTypes,
  body: string,
  mediaUrls: string[] = [],
  isTest: boolean = false
) {
  logger.trace('sendMessage', ...arguments);

  // Make sure the number is valid
  const phoneCategories = await twilioPhoneCategories();
  if (typeof phoneCategories[sendNumberCategory] === 'undefined') {
    throw new Error(`Invalid phone number category - ${sendNumberCategory}`);
  }
  const numberConfig = phoneCategories[sendNumberCategory];

  let saveMessageDataPromise: Promise<unknown> = new Promise(res => res(null));
  if (messageId === null) {
    messageId = Date.now();
    saveMessageDataPromise = saveMessageData(
      messageType,
      messageId,
      1,
      body,
      mediaUrls,
      null,
      null,
      null,
      isTest
    );
  }

  // Get the twilio configuration
  const twilioConf = await getTwilioSecret();
  if (twilioConf === null) throw new Error('Unable to get twilio secret');

  const fromNumber = numberConfig.number;
  const accountSid = twilioConf[`accountSid${numberConfig.account || ''}`];
  const authToken = twilioConf[`authToken${numberConfig.account || ''}`];
  if (
    typeof fromNumber === 'undefined' ||
    typeof accountSid === 'undefined' ||
    typeof authToken === 'undefined'
  ) {
    logger.error(`Invalid phone information - ${sendNumberCategory}`, fromNumber, accountSid, authToken);
    throw new Error(`Invalid phone information - ${sendNumberCategory}`);
  }

  return Promise.all([
    twilio(accountSid, authToken)
      .messages.create({
        body,
        mediaUrl: mediaUrls,
        from: fromNumber,
        to: `+1${phone}`,
        statusCallback: `https://new.cofrn.org/api/v2/twilio/${messageId}/`,
      }),
    saveMessageDataPromise,
  ]);
}

export async function sendAlertMessage(
  alertType: AlertCategory,
  body: string
) {
  logger.trace('sendAlertMessage', ...arguments);

  const messageId = Date.now();
  const recipients = (await getUserRecipients('all', null))
    .filter(user => user[`get${alertType}Alerts`]);
  if (recipients.length === 0) throw new Error(`No recipients found for ${alertType} alert`);

  await Promise.all([
    saveMessageData('alert', messageId, recipients.length, body),
    ...recipients.map(user => sendMessage(
      'alert',
      messageId,
      user.phone,
      'alert',
      body
    )),
  ]);
}

const DEFAULT_PAGE_NUMBER = 'page';
export async function getPageNumber(user: FullUserObject): Promise<PhoneNumberTypes> {
  // Get the active departments for the user
  const possibleDepartments = getUserPermissions(user).activeDepartments;

  // Get the twilio phone information
  const phoneCategories = await twilioPhoneCategories();

  // If there is only one department, use that department's number
  if (possibleDepartments.length === 1) {
    const phoneName: `page${UserDepartment}` = `page${possibleDepartments[0]}`;
    return phoneName in phoneCategories
      ? phoneName as PhoneNumberTypes
      : DEFAULT_PAGE_NUMBER;
  }

  // Check for an explicitly set paging number
  if (
    typeof user.pagingPhone !== 'undefined' &&
    possibleDepartments.includes(user.pagingPhone) &&
    `page${user.pagingPhone}` in phoneCategories
  ) {
    return `page${user.pagingPhone}`;
  }

  /*
   * Use the global paging number if the user is:
   * - a member of multiple departments without a paging number set
   * - a member no departments
   */
  return DEFAULT_PAGE_NUMBER;
}
