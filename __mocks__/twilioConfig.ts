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
});

([
  'Bacapage',
  'Crestonepage',
  'alert',
  'Crestonechat',
  'NSCADchat',
  'NSCADpage',
  'Saguachepage',
] as const).forEach((phone, idx) => {
  twilioConf[`phoneNumber${phone}`] = `+1${idx
    .toString()
    .repeat(10)
    .slice(0, 10)}`;
});
