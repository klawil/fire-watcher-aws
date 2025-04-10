import * as aws from 'aws-sdk';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { getLogger } from '@/utils/common/logger';
import { parseDynamoDbAttributeMap } from './dynamodb';
import { InternalUserObject } from '@/deprecated/common/userApi';
import {
  authTokenCookie, authUserCookie, isUserActive, isUserAdmin
} from '@/deprecated/types/auth';
import { verify } from 'jsonwebtoken';

const logger = getLogger('u-auth');

const dynamodb = new aws.DynamoDB();

const userTable = process.env.TABLE_USER;

interface Cookies {
  [key: string]: string;
}

/**
 * @deprecated The method should not be used
 */
export function getCookies(event: APIGatewayProxyEvent): Cookies {
  logger.trace('getCookies', event);
  return (event.headers.Cookie || '')
    .split('; ')
    .reduce((agg: Cookies, val) => {
      const valSplit = val.split('=');
      if (valSplit[0] !== '') {
        if (valSplit.length < 2) {
          valSplit.push('');
        }

        agg[valSplit[0]] = valSplit[1];
      }
      return agg;
    }, {});
}

const jwtSecretArn = process.env.JWT_SECRET;
const secretManager = new aws.SecretsManager();

/**
 * @deprecated The method should not be used
 */
export async function getLoggedInUser(event: APIGatewayProxyEvent): Promise<null | InternalUserObject> {
  logger.trace('getLoggedInUser', event);

  try {
    const cookies = getCookies(event);

    // Check that the auth cookies are present
    if (
      typeof cookies[authUserCookie] === 'undefined' ||
      typeof cookies[authTokenCookie] === 'undefined'
    ) {
      logger.warn('getLoggedInUser', 'failed', 'no cookies');
      return null;
    }

    // Get and validate the JWT
    const jwtSecret = await secretManager.getSecretValue({
      SecretId: jwtSecretArn,
    }).promise()
      .then(data => data.SecretString);
    if (typeof jwtSecret === 'undefined') throw new Error('Unable to get JWT secret');
    const userPayload = verify(
      cookies[authTokenCookie],
      jwtSecret
    );
    if (
      typeof userPayload === 'string' ||
      !('phone' in userPayload)
    ) {
      logger.error('Bad payload', userPayload);
      throw new Error('Wrong JWT payload');
    }

    // Validate the cookies
    const user = await dynamodb.getItem({
      TableName: userTable,
      Key: {
        phone: {
          N: userPayload.phone.toString(),
        },
      },
    }).promise();
    if (!user.Item) {
      logger.warn('getLoggedInUser', 'failed', 'invalid user');
      return null;
    }

    // Handle the isAdmin determination
    const parsedUser = parseDynamoDbAttributeMap(user.Item) as unknown as InternalUserObject;
    parsedUser.isAdmin = isUserAdmin(user.Item);
    parsedUser.isActive = isUserActive(user.Item);

    return parsedUser;
  } catch (e) {
    logger.error('getLoggedInUser', e);
    return null;
  }
}
