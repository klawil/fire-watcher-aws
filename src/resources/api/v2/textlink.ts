import {
  LambdaApiFunction,
  handleResourceApi
} from './_base';

import {
  api302Body, generateApi400Body
} from '@/types/api/_shared';
import {
  TextLinkApi, textLinkApiValidator
} from '@/types/api/textlink';
import { FullTextObject } from '@/types/api/texts';
import { pagingTalkgroupConfig } from '@/types/backend/department';
import {
  TABLE_TEXT, typedUpdate
} from '@/utils/backend/dynamoTyped';
import { validateObject } from '@/utils/backend/validation';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('resources/api/v2/textlink');

const GET: LambdaApiFunction<TextLinkApi> = async function (event) {
  logger.trace('GET', ...arguments);

  // Validate the query parameters
  const [
    query,
    queryErrors,
  ] = validateObject<TextLinkApi['query']>(
    event.queryStringParameters || {},
    textLinkApiValidator
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

  // Handle marking a message as opened by a user
  if (
    typeof query.m !== 'undefined' &&
    typeof query.p !== 'undefined'
  ) {
    try {
      await typedUpdate<FullTextObject>({
        TableName: TABLE_TEXT,
        Key: {
          datetime: query.m,
        },
        ExpressionAttributeNames: {
          '#csLooked': 'csLooked',
          '#csLookedTime': 'csLookedTime',
        },
        ExpressionAttributeValues: {
          ':csLooked': [ query.p, ],
          ':csLookedTime': [ Date.now(), ],
          ':csLookedPhone': query.p,
          ':blankList': [],
        },
        ConditionExpression: 'NOT contains(#csLooked, :csLookedPhone)',
        UpdateExpression: 'SET #csLooked = list_append(if_not_exists(#csLooked, :blankList), :csLooked), #csLookedTime = list_append(if_not_exists(#csLookedTime, :blankList), :csLookedTime)',
      });
    } catch (e: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (
        !('name' in e) ||
        e.name !== 'ConditionalCheckFailedException'
      ) {
        throw e;
      }
    }
  }

  // Build the destination URL
  const tgConfig = pagingTalkgroupConfig[query.tg];
  const finalUrl = `/?f=${encodeURIComponent(query.f)}&tg=${tgConfig.linkPreset}` +
    `&utm_source=${query.t === '1' ? 'transcript' : 'text'}&utm_medium=text&utm_campaign=${encodeURIComponent(query.f)}`;

  return [
    302,
    api302Body,
    {
      'Location': [ finalUrl, ],
    },
  ];
};

export const main = handleResourceApi.bind(null, {
  GET,
});
