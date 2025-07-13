import {
  GetObjectCommand, S3Client
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';

import {
  api401Body, api403Body, generateApi400Body
} from '@/types/api/_shared';
import {
  FullTextObject, GetAllTextsApi, allowedFrontendTextFields, getAllTextsApiQueryValidator
} from '@/types/api/texts';
import { TypedQueryInput } from '@/types/backend/dynamo';
import {
  TABLE_TEXT, typedQuery
} from '@/utils/backend/dynamoTyped';
import { validateObject } from '@/utils/backend/validation';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('texts');

const s3 = new S3Client();
const cacheBucket = process.env.COSTS_BUCKET;

const anyAdminTextTypes: FullTextObject['type'][] = [
  'page',
  'transcript',
  'pageAnnounce',
];
const GET: LambdaApiFunction<GetAllTextsApi> = async function (event, user, userPerms) {
  logger.debug('GET', ...arguments);

  // Validate the query
  const [
    query,
    queryErrors,
  ] = validateObject<GetAllTextsApi['query']>(
    event.queryStringParameters || {},
    getAllTextsApiQueryValidator
  );
  if (
    query === null ||
    queryErrors.length > 0
  ) {
    return [
      400,
      generateApi400Body(queryErrors),
    ];
  }

  // Make sure either department or type is passed
  if (
    typeof query.type === typeof query.department
  ) {
    return [
      400,
      generateApi400Body([
        'type',
        'department',
      ]),
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

  // Build the query input
  let queryInput: (TypedQueryInput<FullTextObject> & Required<Pick<
    TypedQueryInput<FullTextObject>,
    'ExpressionAttributeNames' | 'ExpressionAttributeValues'
  >>) | null = null;
  if (typeof query.type !== 'undefined') {
    queryInput = {
      TableName: TABLE_TEXT,
      IndexName: 'typeIndex',
      ScanIndexForward: false,
      ExpressionAttributeNames: {
        '#type': 'type',
      },
      ExpressionAttributeValues: {
        ':type': query.type,
      },
      KeyConditionExpression: '#type = :type',
      Limit: 100,
    };
  } else if (typeof query.department !== 'undefined') {
    queryInput = {
      TableName: TABLE_TEXT,
      IndexName: 'departmentIndex',
      ScanIndexForward: false,
      ExpressionAttributeNames: {
        '#department': 'department',
      },
      ExpressionAttributeValues: {
        ':department': query.department,
      },
      KeyConditionExpression: '#department = :department',
      Limit: 100,
    };
  }
  if (queryInput === null) {
    throw new Error('Not enough info to make query');
  }

  // Add the timing component
  if (typeof query.before !== 'undefined') {
    queryInput.ExpressionAttributeNames['#datetime'] = 'datetime';
    queryInput.ExpressionAttributeValues[':datetime'] = query.before;
    queryInput.KeyConditionExpression += ' AND #datetime < :datetime';
  }

  // Run the query
  const result = await typedQuery<FullTextObject>(queryInput);

  // Filter out the texts the current user should not see
  const data = (result.Items || [])
    .filter(text => {
      // Don't show texts that include auth codes
      if (text.type === 'account') {
        return false;
      }

      // Don't show texts that aren't sent to anyone
      if (
        text.recipients === 0 &&
        query.all !== 'y'
      ) {
        return false;
      }

      // Show all remaining texts to the district admin
      if (user.isDistrictAdmin) {
        return true;
      }

      // Show certain types of texts to any admin
      if (anyAdminTextTypes.includes(text.type)) {
        return true;
      }

      // Don't show texts that aren't associated with a specific department
      if (typeof text.department === 'undefined') {
        return false;
      }

      // Don't show texts that are affiliated with a department the user is not a member of
      return userPerms.adminDepartments.includes(text.department);
    })
    .map(text => {
      (Object.keys(text) as (keyof typeof text)[])
        .filter(key => !allowedFrontendTextFields.includes(key))
        .forEach(key => delete text[key]);
      return text;
    });

  // Fill in the signed S3 urls for media as needed
  const signedUrlPromises: Promise<{
    textIdx: number;
    idx: number;
    url: string;
  }>[] = [];
  data.forEach((text, textIdx) => {
    if (
      !text.mediaUrls ||
      !Array.isArray(text.mediaUrls) ||
      !text.mediaUrls.some(u => u.startsWith('textMedia'))
    ) {
      return;
    }

    text.mediaUrls.forEach((url, idx) => {
      if (!url.startsWith('textMedia')) {
        return;
      }

      signedUrlPromises.push((async () => ({
        textIdx,
        idx,
        url: await getSignedUrl(s3, new GetObjectCommand({
          Bucket: cacheBucket,
          Key: url,
        })),
      }))());
    });
  });
  (await Promise.all(signedUrlPromises))
    .forEach(result => {
      data[result.textIdx].mediaUrls = Array.isArray(data[result.textIdx].mediaUrls)
        ? data[result.textIdx].mediaUrls
        : [];
      (data[result.textIdx].mediaUrls as string[])[result.idx] = result.url;
    });

  // Build the response
  return [
    200,
    {
      count: data.length,
      scanned: result.ScannedCount || 0,
      texts: data,
    },
  ];
};

export const main = handleResourceApi.bind(null, {
  GET,
});
