import { twilioConf } from '../twilioConfig';

import { BaseClientMock } from './_base';

export const SecretsManagerClientMock = new BaseClientMock();

export const SecretsManagerClient = SecretsManagerClientMock.client;
export const GetSecretValueCommand = SecretsManagerClientMock.getCommand('getSecretValue');

SecretsManagerClientMock.baseResults['getSecretValue'] = {
  SecretString: JSON.stringify(twilioConf),
};
