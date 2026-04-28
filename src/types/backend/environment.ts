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

type ENV_VAR_FN = () => string;
const getEnvVariableOrError = (name: string): ENV_VAR_FN => {
  return () => {
    const val = process.env[name];
    if (typeof val === 'undefined') {
      throw new Error(`Environment variable ${name} is not defined`);
    }

    return process.env[name] as string;
  };
};

// Buckets
export const BUCKET_COSTS = getEnvVariableOrError('BKT_COSTS');
export const BUCKET_EVENTS = getEnvVariableOrError('BKT_EVENTS');
export const BUCKET_AUDIO = getEnvVariableOrError('BKT_AUDIO');
export const BUCKET_EMAIL = getEnvVariableOrError('BKT_EMAIL');

// Tables
export const TABLE_DEVICES = getEnvVariableOrError('TBL_DEVICES');
export const TABLE_ERROR = getEnvVariableOrError('TBL_ERROR');
export const TABLE_FILE = getEnvVariableOrError('TBL_FILE');
export const TABLE_FILE_TRANSLATION = getEnvVariableOrError('TBL_DTR_TRANSLATION');
export const TABLE_INVOICE = getEnvVariableOrError('TBL_INVOICE');
export const TABLE_RADIOS = getEnvVariableOrError('TBL_RADIOS');
export const TABLE_SITE = getEnvVariableOrError('TBL_SITE');
export const TABLE_STATUS = getEnvVariableOrError('TBL_STATUS');
export const TABLE_TALKGROUP = getEnvVariableOrError('TBL_TALKGROUP');
export const TABLE_TEXT = getEnvVariableOrError('TBL_TEXT');
export const TABLE_USER = getEnvVariableOrError('TBL_USER');
export const TABLE_DEPARTMENT = getEnvVariableOrError('TBL_DEPARTMENT');

// Secrets
export const SECRET_JWT = getEnvVariableOrError('SCRT_JWT');
export const SECRET_TWILIO = getEnvVariableOrError('SCRT_TWILIO');
export const SECRET_ALADTEC = getEnvVariableOrError('SCRT_ALADTEC');

// Queues
export const QUEUE_EVENTS = getEnvVariableOrError('Q_EVENTS');
export const QUEUE_TWILIO = getEnvVariableOrError('Q_TWILIO');

// Firehose
export const FIREHOSE_EVENTS = getEnvVariableOrError('FH_EVENTS');

// Other
export const API_CODE = getEnvVariableOrError('API_CODE');
export const EMAIL_SOURCE = getEnvVariableOrError('EMAIL_SOURCE');
export const GLUE_TABLE = getEnvVariableOrError('GLUE_TABLE');
export const GLUE_DATABASE = getEnvVariableOrError('GLUE_DATABASE');
export const ATHENA_WORKGROUP = getEnvVariableOrError('ATHENA_WORKGROUP');
