export type TableNames = 'DEVICES' | 'DTR_TRANSLATION' | 'ERROR' | 'FILE' | 'RADIOS'
  | 'SITE' | 'STATUS' | 'TALKGROUP' | 'TEXT' | 'USER' | 'DEPARTMENT' | 'INVOICE';

type TableEnvName = `TBL_${TableNames}`;
type TableNameMap = {
  [key in TableEnvName]: string;
};

export type BucketNames = 'COSTS' | 'EVENTS' | 'AUDIO' | 'EMAIL';

type BucketEnvName = `BKT_${BucketNames}`;
type BucketNameMap = {
  [key in BucketEnvName]: string;
};

export type SecretNames = 'JWT' | 'TWILIO' | 'ALADTEC';

type SecretEnvName = `SCRT_${SecretNames}`;
type SecretNameMap = {
  [key in SecretEnvName]: string;
};

export type QueueNames = 'EVENTS' | 'TWILIO';

type QueueEnvName = `Q_${QueueNames}`;
type QueueNameMap = {
  [key in QueueEnvName]: string;
};

export type FirehoseNames = 'EVENTS';

type FirehoseEnvName = `FH_${FirehoseNames}`;
type FirehoseNameMap = {
  [key in FirehoseEnvName]: string;
};

export interface LambdaEnvironment
  extends TableNameMap, BucketNameMap, SecretNameMap, QueueNameMap, FirehoseNameMap {
  API_CODE: string;

  // Email Sending
  EMAIL_SOURCE: string;

  // Events Athena table
  GLUE_TABLE: string;
  GLUE_DATABASE: string;
  ATHENA_WORKGROUP: string;
}

declare global {
  namespace NodeJS { // eslint-disable-line @typescript-eslint/no-namespace
    export interface ProcessEnv extends LambdaEnvironment {
      A?: null;
    }
  }
}

// Buckets
export const BUCKET_COSTS: string = process.env.BKT_COSTS;
export const BUCKET_EVENTS: string = process.env.BKT_EVENTS;
export const BUCKET_AUDIO: string = process.env.BKT_AUDIO;
export const BUCKET_EMAIL: string = process.env.BKT_EMAIL;

// Tables
export const TABLE_DEVICES: string = process.env.TBL_DEVICES;
export const TABLE_ERROR: string = process.env.TBL_ERROR;
export const TABLE_FILE: string = process.env.TBL_FILE;
export const TABLE_FILE_TRANSLATION: string = process.env.TBL_DTR_TRANSLATION;
export const TABLE_RADIOS: string = process.env.TBL_RADIOS;
export const TABLE_SITE: string = process.env.TBL_SITE;
export const TABLE_STATUS: string = process.env.TBL_STATUS;
export const TABLE_TALKGROUP: string = process.env.TBL_TALKGROUP;
export const TABLE_TEXT: string = process.env.TBL_TEXT;
export const TABLE_USER: string = process.env.TBL_USER;
export const TABLE_DEPARTMENT: string = process.env.TBL_DEPARTMENT;

// Secrets
export const SECRET_JWT: string = process.env.SCRT_JWT;
export const SECRET_TWILIO: string = process.env.SCRT_TWILIO;
export const SECRET_ALADTEC: string = process.env.SCRT_ALADTEC;

// Queues
export const QUEUE_EVENTS: string = process.env.Q_EVENTS;
export const QUEUE_TWILIO: string = process.env.Q_TWILIO;

// Firehose
export const FIREHOSE_EVENTS: string = process.env.FH_EVENTS;

// Other
export const API_CODE: string = process.env.API_CODE;
export const EMAIL_SOURCE: string = process.env.EMAIL_SOURCE;
export const GLUE_TABLE: string = process.env.GLUE_TABLE;
export const GLUE_DATABASE: string = process.env.GLUE_DATABASE;
export const ATHENA_WORKGROUP: string = process.env.ATHENA_WORKGROUP;
