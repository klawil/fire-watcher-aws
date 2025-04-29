import { twilioConf } from '../twilioConfig';

import { BaseClientMock } from './_base';

const results = {
  TWILIO_SECRET_VAL: {
    SecretString: JSON.stringify(twilioConf),
  },
  JWT_SECRET_VAL: {
    SecretString: 'JWT-Secret-Value',
  },
} as const;

export const SecretsManagerClientMock = new BaseClientMock();
SecretsManagerClientMock.send.mockImplementation(input => {
  let result = {};
  if (
    typeof input === 'object' &&
    input !== null &&
    'SecretId' in input &&
    input.SecretId as keyof typeof results in results
  ) {
    result = results[input.SecretId as keyof typeof results];
  }
  return Promise.resolve(result);
});

export const SecretsManagerClient = SecretsManagerClientMock.client;
export const GetSecretValueCommand = SecretsManagerClientMock.getCommand('getSecretValue');
