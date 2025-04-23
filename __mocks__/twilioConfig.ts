export const twilioConf: Record<string, string> = {};

[
  '',
  'Baca',
  'Crestone',
  'NSCAD',
  'Saguache',
].forEach(account => {
  twilioConf[`accountSid${account}`] = `accountSid${account}`;
  twilioConf[`authToken${account}`] = `authToken${account}`;

  [
    'page',
    'alert',
    'chat',
  ].forEach(phone => {
    twilioConf[`phoneNumber${account}${phone}`] = `phoneNumber${account}${phone}`;
  });
});
