import * as aws from 'aws-sdk';

/**
 * @deprecated The method should not be used
 */
export const authUserCookie = 'cofrn-user';

/**
 * @deprecated The method should not be used
 */
export const authTokenCookie = 'cofrn-token';

/**
 * @deprecated The method should not be used
 */
export const allUserCookies = [
  authUserCookie,
  authTokenCookie,
  'cofrn-user-name',
  'cofrn-user-admin',
  'cofrn-user-super',
];

/**
 * @deprecated The method should not be used
 */
export function isUserActive(user: aws.DynamoDB.AttributeMap): boolean {
  const userKeys = Object.keys(user);
  for (let i = 0; i < userKeys.length; i++) {
    const key = userKeys[i];
    if (user[key].M?.active?.BOOL) {
      return true;
    }
  }

  return false;
}

/**
 * @deprecated The method should not be used
 */
export function isUserAdmin(user: aws.DynamoDB.AttributeMap): boolean {
  const userKeys = Object.keys(user);
  for (let i = 0; i < userKeys.length; i++) {
    const key = userKeys[i];
    if (
      user[key].M?.active?.BOOL &&
      user[key].M?.admin?.BOOL
    ) {
      return true;
    }
  }

  return false;
}
