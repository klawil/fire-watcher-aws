import {
  CloudWatchClient, PutMetricDataCommand,
  PutMetricDataCommandInput
} from '@aws-sdk/client-cloudwatch';
import {
  GetSecretValueCommand, SecretsManagerClient
} from '@aws-sdk/client-secrets-manager';
import * as aws from 'aws-sdk';

import {
  UserDepartment
} from '@/types/api/users';
import {
  PhoneNumberAccount, PhoneNumberTypes, TwilioAccounts, TwilioNumberTypes
} from '@/types/backend/department';
import { getLogger } from '@/utils/common/logger';

const logger = getLogger('u-gen');

const secretManager = new SecretsManagerClient();
const cloudWatch = new CloudWatchClient();

type AccountSidKey = `accountSid${TwilioAccounts}`;
type AuthTokenKey = `authToken${TwilioAccounts}`;
type PhoneNumberKey = `phoneNumber${TwilioAccounts}${TwilioNumberTypes}`;

export type TwilioConfig = {
  [key in AccountSidKey]: string;
} & {
  [key in AuthTokenKey]: string;
} & {
  [key in PhoneNumberKey]?: string;
} & {
  accountSid: string;
  authToken: string;
  apiCode: string;
  voiceOutgoingSid: string;
  voiceApiSid: string;
  voiceApiSecret: string;
};

export interface PhoneNumberConfig {
  name?: string;
  number: string;
  numberKey: PhoneNumberKey;
  account?: PhoneNumberAccount;
  type: TwilioNumberTypes;
  department?: UserDepartment;
}

type TwilioPhoneCategories = {
  [key in PhoneNumberTypes]?: PhoneNumberConfig;
};

const twilioSecretId = process.env.TWILIO_SECRET;
let cachedTwilioPhoneCategories: null | Promise<TwilioPhoneCategories> = null;
export const twilioPhoneCategories: () => Promise<TwilioPhoneCategories> = async () => {
  if (cachedTwilioPhoneCategories === null) {
    cachedTwilioPhoneCategories = (async () => {
      const baseObject: TwilioPhoneCategories = {
        pageBaca: {
          type: 'page',
          number: '',
          numberKey: 'phoneNumberBacapage',
          account: 'Baca',
          department: 'Baca',
        },
        page: {
          number: '',
          numberKey: 'phoneNumberCrestonepage',
          type: 'page',
          account: 'Crestone',
          department: 'Crestone',
        },
        alert: {
          number: '',
          numberKey: 'phoneNumberalert',
          type: 'alert',
        },
        chatCrestone: {
          number: '',
          numberKey: 'phoneNumberCrestonechat',
          type: 'chat',
          department: 'Crestone',
          account: 'Crestone',
        },
        chatNSCAD: {
          number: '',
          numberKey: 'phoneNumberNSCADchat',
          type: 'chat',
          department: 'NSCAD',
          account: 'NSCAD',
        },
        pageNSCAD: {
          number: '',
          numberKey: 'phoneNumberNSCADpage',
          type: 'page',
          department: 'NSCAD',
          account: 'NSCAD',
        },
        pageSaguache: {
          number: '',
          numberKey: 'phoneNumberSaguachepage',
          type: 'page',
          department: 'Saguache',
          account: 'Saguache',
        },
      };

      const twilioConf = await getTwilioSecret();

      (Object.keys(baseObject) as (keyof TwilioPhoneCategories)[]).forEach(key => {
        if (
          typeof baseObject[key] === 'undefined' ||
          typeof twilioConf[baseObject[key].numberKey] === 'undefined'
        ) {
          delete baseObject[key];
          return;
        }

        baseObject[key].number = twilioConf[baseObject[key].numberKey] as string;
      });
      return baseObject;
    })();
  }

  return cachedTwilioPhoneCategories;
};

interface TwilioPhoneNumbers {
  [key: string]: PhoneNumberConfig;
}
let cachedTwilioPhoneNumbers: null | Promise<TwilioPhoneNumbers> = null;
export const twilioPhoneNumbers: () => Promise<TwilioPhoneNumbers> = async () => {
  if (cachedTwilioPhoneNumbers === null) {
    cachedTwilioPhoneNumbers = (async () => {
      const phoneCategories = await twilioPhoneCategories();
      return (Object.keys(phoneCategories) as (keyof TwilioPhoneCategories)[])
        .reduce((agg: TwilioPhoneNumbers, key) => {
          if (typeof phoneCategories[key] !== 'undefined') {
            agg[phoneCategories[key].number] = {
              name: key,
              ...phoneCategories[key],
            };
          }

          return agg;
        }, {});
    })();
  }
  return cachedTwilioPhoneNumbers;
};

let twilioSecret: null | Promise<TwilioConfig> = null;
export async function getTwilioSecret(): Promise<TwilioConfig> {
  logger.trace('getTwilioSecret', ...arguments);
  if (twilioSecret !== null) {
    return twilioSecret;
  }

  twilioSecret = secretManager.send(new GetSecretValueCommand({
    SecretId: twilioSecretId,
  }))
    .then(data => JSON.parse(data.SecretString as string))
    .catch(e => {
      logger.error('getTwilioSecret', e);
      return null;
    });

  return twilioSecret;
}

interface CallMetric {
  source: string;
  action: string;
}

interface EventMetric {
  source: string;
  type: string;
  event: string;
}

/**
 * @deprecated The method should not be used
 */
export async function incrementMetric(
  name: 'Call',
  metricData: CallMetric,
  sendLessSpecific?: boolean,
  sendMoreSpecific?: boolean
): Promise<unknown>;

/**
 * @deprecated The method should not be used
 */
export async function incrementMetric(
  name: 'Event',
  metricData: EventMetric,
  sendLessSpecific?: boolean,
  sendMoreSpecific?: boolean
): Promise<unknown>;

/**
 * @deprecated The method should not be used
 */
export async function incrementMetric(
  name: 'Call' | 'Event',
  metricData: CallMetric | EventMetric,
  sendLessSpecific: boolean = true,
  sendMoreSpecific: boolean = true
): Promise<unknown> {
  logger.trace('incrementMetric', ...arguments);
  const putConfig: PutMetricDataCommandInput & Required<Pick<PutMetricDataCommandInput, 'MetricData'>> = {
    Namespace: 'CVFD API',
    MetricData: [],
  };

  if (sendLessSpecific && name !== 'Event') {
    putConfig.MetricData.push({
      MetricName: name,
      Dimensions: [ {
        Name: 'source',
        Value: metricData.source,
      }, ],
      Timestamp: new Date(),
      Unit: 'Count',
      Value: 1,
    });
  }

  if (sendMoreSpecific) {
    putConfig.MetricData.push({
      MetricName: name,
      Dimensions: (Object.keys(metricData) as Array<keyof typeof metricData>)
        .reduce((agg: aws.CloudWatch.Dimensions, key) => [
          ...agg,
          {
            Name: key,
            Value: metricData[key],
          },
        ], []),
      Timestamp: new Date(),
      Unit: 'Count',
      Value: 1,
    });
  }

  await cloudWatch.send(new PutMetricDataCommand(putConfig));
  return;
}
