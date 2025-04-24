process.env.TESTING_USER = '5555555555';
process.env.SQS_QUEUE = 'SQS_QUEUE';
process.env.TWILIO_QUEUE = 'TWILIO_QUEUE';
process.env.JWT_SECRET = 'JWT_SECRET';
process.env.TWILIO_SECRET = 'TWILIO_SECRET';

[
  'TEXT',
  'USER',
  'FILE',
  'STATUS',
  'TALKGROUP',
  'SITE',
  'DTR_TRANSLATION',
].forEach(table => process.env[`TABLE_${table}`] = `TABLE_${table}`);
