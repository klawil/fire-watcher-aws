import * as AWS from 'aws-sdk';
import { getLogger } from '../../utils/logger';
import { checkObject, getCurrentUser, handleResourceApi, LambdaApiFunction, TABLE_TEXT } from './_base';
import { FullTextObject, GetAllTextsApi, getAllTextsApiQueryValidator, omittedFrontendTextFields } from '@/common/apiv2/texts';
import { api401Body, api403Body, generateApi400Body } from '@/common/apiv2/_shared';

const logger = getLogger('texts');
const docClient = new AWS.DynamoDB.DocumentClient();

const anyAdminTextTypes: FullTextObject['type'][] = [ 'page', 'transcript', 'pageAnnounce', ];
const GET: LambdaApiFunction<GetAllTextsApi> = async function (event) {
  logger.debug('GET', ...arguments);

  // Validate the query
  const [ query, queryErrors ] = !event.queryStringParameters
    ? [ {}, [] ]
    : checkObject(
      event.queryStringParameters,
      getAllTextsApiQueryValidator,
    );
  if (
    query === null ||
    queryErrors.length > 0
  )
    return [
      400,
      generateApi400Body(queryErrors),
    ];

  const wantPages = query.page === 'y';

  // Authorize the user
  const [ user, userPerms, userHeaders ] = await getCurrentUser(event);
  if (user === null) return [ 401, api401Body, userHeaders ];
  if (!userPerms.isAdmin) return [ 403, api403Body, userHeaders ];

  // Build and run the query
  const queryInput: AWS.DynamoDB.DocumentClient.QueryInput & Required<Pick<
    AWS.DynamoDB.DocumentClient.QueryInput,
    'ExpressionAttributeNames' | 'ExpressionAttributeValues'
  >> = {
    TableName: TABLE_TEXT,
    IndexName: 'testPageIndex',
    Limit: 100,
    ScanIndexForward: false,
    ExpressionAttributeNames: {
      '#testPageIndex': 'testPageIndex',
    },
    ExpressionAttributeValues: {
      ':testPageIndex': `n${wantPages ? 'y' : 'n'}`,
    },
    KeyConditionExpression: '#testPageIndex = :testPageIndex',
  };
  if (typeof query.before !== 'undefined') {
    queryInput.ExpressionAttributeNames['#datetime'] = 'datetime'
    queryInput.ExpressionAttributeValues[':datetime'] = query.before;
		queryInput.KeyConditionExpression += ' AND #datetime < :datetime';
  }
  const result = await docClient.query(queryInput).promise();

  // Filter out the texts the current user should not see
  const data = ((result.Items || []) as FullTextObject[])
    .filter(text => {
      // Don't show texts that include auth codes
      if (text.type === 'account') return false;

      // Don't show texts that aren't sent to anyone
      if (text.recipients === 0) return false;

      // Show all remaining texts to the district admin
      if (user.isDistrictAdmin) return true;

      // Show certain types of texts to any admin
      if (anyAdminTextTypes.includes(text.type)) return true;

      // Don't show texts that aren't associated with a specific department
      if (typeof text.department === 'undefined') return false;

      // Don't show texts that are affiliated with a department the user is not a member of
      return userPerms.adminDepartments.includes(text.department);
    })
    .map(text => {
      omittedFrontendTextFields.forEach(key => delete text[key]);
      return text;
    });

  // Build the response
  return [
    200,
    {
      count: data.length,
      scanned: result.ScannedCount || 0,
      texts: data,
    },
    userHeaders,
  ];
}

export const main = handleResourceApi.bind(null, {
  GET,
});
