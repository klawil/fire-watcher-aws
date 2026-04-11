process.env.BKT_COSTS = 'COSTS_BUCKET_VAL';
process.env.BKT_EVENTS = 'EVENTS_BUCKET_VAL';
process.env.BKT_AUDIO = 'AUDIO_BUCKET_VAL';
process.env.BKT_EMAIL = 'EMAIL_BUCKET_VAL';

process.env.SCRT_ALADTEC = 'ALADTEC_SECRET_VAL';
process.env.SCRT_JWT = 'JWT_SECRET_VAL';
process.env.SCRT_TWILIO = 'TWILIO_SECRET_VAL';

process.env.Q_EVENTS = 'EVENTS_QUEUE_VAL';
process.env.Q_TWILIO = 'TWILIO_QUEUE_VAL';

process.env.FH_EVENTS = 'EVENTS_FIREHOSE_VAL';

process.env.API_CODE = 'TEST_API_CODE';
process.env.EMAIL_SOURCE = 'EMAIL_SOURCE_VAL';
process.env.GLUE_TABLE = 'GLUE_TABLE_VAL';
process.env.GLUE_DATABASE = 'GLUE_DATABASE_VAL';
process.env.ATHENA_WORKGROUP = 'ATHENA_WORKGROUP_VAL';

[
  'DEVICES',
  'ERROR',
  'TEXT',
  'USER',
  'FILE',
  'STATUS',
  'TALKGROUP',
  'SITE',
  'DTR_TRANSLATION',
  'RADIOS',
  'DEPARTMENT',
  'INVOICE',
].forEach(table => process.env[`TBL_${table}`] = `TABLE_${table}_VAL`);
