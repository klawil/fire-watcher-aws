import { TwilioConfig } from '@/deprecated/utils/general';

export const twilioConf: TwilioConfig = {
  apiCode: 'apiCodeValue',
} as TwilioConfig;

([
  '',
  'Baca',
  'Crestone',
  'NSCAD',
  'Saguache',
] as const).forEach(account => {
  twilioConf[`accountSid${account}`] = `accountSid${account}`;
  twilioConf[`authToken${account}`] = `authToken${account}`;

  ([
    'page',
    'alert',
    'chat',
  ] as const).forEach(phone => {
    twilioConf[`phoneNumber${account}${phone}`] = `phoneNumber${account}${phone}`;
  });
});
