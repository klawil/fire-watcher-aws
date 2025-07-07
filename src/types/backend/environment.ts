export interface LambdaEnvironment {
  S3_BUCKET: string;
  EVENTS_S3_BUCKET: string;
  JWT_SECRET: string;
  TWILIO_SECRET: string;
  TESTING_USER: string;
  TABLE_USER: string;
  TABLE_ERROR: string;
  TABLE_FILE: string;
  TABLE_TEXT: string;
  TABLE_STATUS: string;
  TABLE_TALKGROUP: string;
  TABLE_SITE: string;
  TABLE_DTR_TRANSLATION: string;
  TABLE_DEVICES: string;
  COSTS_BUCKET: string;
  FIREHOSE_NAME: string;
  SQS_QUEUE: string;
  TWILIO_QUEUE: string;
  EVENTS_S3_QUEUE: string;

  GLUE_TABLE: string;
  GLUE_DATABASE: string;
  ATHENA_WORKGROUP: string;
}

declare global {
  namespace NodeJS { // eslint-disable-line @typescript-eslint/no-namespace
    export interface ProcessEnv extends LambdaEnvironment {
      OTHER: string | undefined;
    }
  }
}
