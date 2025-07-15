export interface LambdaEnvironment {
  // S3 Buckets
  COSTS_BUCKET: string;
  EVENTS_S3_BUCKET: string;
  S3_BUCKET: string;

  // Secret IDs
  JWT_SECRET: string;
  TWILIO_SECRET: string;

  // DynamoDB Tables
  TABLE_DEVICES: string;
  TABLE_DTR_TRANSLATION: string;
  TABLE_ERROR: string;
  TABLE_FILE: string;
  TABLE_RADIOS: string;
  TABLE_SITE: string;
  TABLE_STATUS: string;
  TABLE_TALKGROUP: string;
  TABLE_TEXT: string;
  TABLE_USER: string;

  // Queues
  SQS_QUEUE: string;
  TWILIO_QUEUE: string;

  // Events Athena table
  GLUE_TABLE: string;
  GLUE_DATABASE: string;
  ATHENA_WORKGROUP: string;

  FIREHOSE_NAME: string;
  TESTING_USER: string;
}

declare global {
  namespace NodeJS { // eslint-disable-line @typescript-eslint/no-namespace
    export interface ProcessEnv extends LambdaEnvironment {
      OTHER: string | undefined;
    }
  }
}
