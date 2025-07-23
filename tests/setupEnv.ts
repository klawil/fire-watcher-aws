process.env.TESTING_USER = '5555555555';
process.env.SQS_QUEUE = 'SQS_QUEUE_VAL';
process.env.TWILIO_QUEUE = 'TWILIO_QUEUE_VAL';
process.env.JWT_SECRET = 'JWT_SECRET_VAL';
process.env.TWILIO_SECRET = 'TWILIO_SECRET_VAL';
process.env.COSTS_BUCKET = 'COSTS_BUCKET_VAL';

[
  'TEXT',
  'USER',
  'FILE',
  'STATUS',
  'TALKGROUP',
  'SITE',
  'DTR_TRANSLATION',
  'RADIOS',
].forEach(table => process.env[`TABLE_${table}`] = `TABLE_${table}_VAL`);
