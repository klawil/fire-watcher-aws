export type TableNames = 'DEVICES' | 'DTR_TRANSLATION' | 'ERROR' | 'FILE' | 'RADIOS'
  | 'SITE' | 'STATUS' | 'TALKGROUP' | 'TEXT' | 'USER';

type TableEnvName = `TABLE_${TableNames}`;

type TableNameMap = {
  [key in TableEnvName]: string;
};

export interface LambdaEnvironment extends TableNameMap {
  // S3 Buckets
  COSTS_BUCKET: string;
  EVENTS_S3_BUCKET: string;
  S3_BUCKET: string;

  // Secret IDs
  JWT_SECRET: string;
  TWILIO_SECRET: string;
  API_CODE: string;

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
