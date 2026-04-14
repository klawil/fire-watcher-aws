import { resolve } from 'path';

import {
  Duration,
  Stack, StackProps, Tags, TimeZone
} from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as athena from 'aws-cdk-lib/aws-athena';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfrontOrigins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cw_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kinesisfirehose from 'aws-cdk-lib/aws-kinesisfirehose';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as lambdanodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3Deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as s3Notifications from 'aws-cdk-lib/aws-s3-notifications';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as schedulerTargets from 'aws-cdk-lib/aws-scheduler-targets';
import * as secretsManager from 'aws-cdk-lib/aws-secretsmanager';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sesActions from 'aws-cdk-lib/aws-ses-actions';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import * as dotenv from 'dotenv';
import { HTTPMethod } from 'ts-oas';

import {
  BucketNames,
  FirehoseNames,
  LambdaEnvironment, QueueNames, SecretNames, TableNames
} from '@/types/backend/environment';

dotenv.config({
  path: resolve(
    __dirname,
    '..', // stack
    '..', // src
    '..', // root
    '.env'
  ),
});

const resourceBase = resolve(
  __dirname,
  '..', // stack
  '..', // src
  'resources'
);

const bucketName = process.env.BUCKET_NAME as string;
const certArn = process.env.SSL_CERT_ARN as string;
const secretArn = process.env.TWILIO_SECRET_ARN as string;
const glueCatalogId = process.env.GLUE_CATALOG_ID as string;
const emailDomain = process.env.EMAIL_DOMAIN as string;

type AlarmTag = 'Dtr' | 'Api';
interface CvfdAlarm {
  tag: AlarmTag;
  codeName: string;
  okayAction: boolean;
  alarm: cloudwatch.AlarmProps;
}

interface LambdaResources {
  tables: {
    [key in TableNames]?: dynamodb.ITable;
  };
  buckets: {
    [key in BucketNames]?: s3.IBucket;
  };
  secrets: {
    [key in SecretNames]?: secretsManager.ISecret;
  };
  queues: {
    [key in QueueNames]?: sqs.IQueue;
  };
  firehoses: {
    [key in FirehoseNames]?: kinesisfirehose.CfnDeliveryStream;
  };
  emailIdentity?: ses.IEmailIdentity;
  athenaPolicy?: iam.IManagedPolicy;
  gluePolicy?: iam.IManagedPolicy;
}

interface LambdaPermissions {
  api?: true;

  extra?: ('sendEmail' | 'apiCode' | 'putMetrics' | 'readMetrics' | 'readMetricsTags' | 'transcribe' | 'athena' | 'glue')[];

  tables?: {
    table: TableNames;
    readonly: boolean;
  }[];
  buckets?: {
    bucket: BucketNames;
    readonly: boolean;
  }[];
  secrets?: SecretNames[];
  queues?: {
    queue: QueueNames;
    read: boolean;
    write: boolean;
  }[];
  firehoses?: FirehoseNames[];
}

function _addApiPermissions(permissions: LambdaPermissions): LambdaPermissions {
  if (!permissions.api) {
    return permissions;
  }

  const newPermissions = {
    ...permissions,
  };

  // Add the user table
  if (!newPermissions.tables?.some(t => t.table === 'USER')) {
    newPermissions.tables = [
      ...newPermissions.tables || [],
      {
        table: 'USER',
        readonly: true,
      },
    ];
  }

  // Add the JWT secret
  if (!newPermissions.secrets?.includes('JWT')) {
    newPermissions.secrets = [
      ...newPermissions.secrets || [],
      'JWT',
    ];
  }

  return newPermissions;
}

function buildLambdaEnvironment(
  baseEnv: LambdaEnvironment,
  permissions: LambdaPermissions
): Partial<LambdaEnvironment> {
  const env: Partial<LambdaEnvironment> = {};
  permissions = _addApiPermissions(permissions);

  // Add resources
  permissions.tables?.forEach(t => {
    if (!baseEnv[`TBL_${t.table}`]) {
      throw new Error(`Table environment variable for table ${t.table} not found in base environment`);
    }
    env[`TBL_${t.table}`] = baseEnv[`TBL_${t.table}`];
  });
  (permissions.buckets || []).forEach(b => {
    if (!baseEnv[`BKT_${b.bucket}`]) {
      throw new Error(`Bucket environment variable for table ${b.bucket} not found in base environment`);
    }
    env[`BKT_${b.bucket}`] = baseEnv[`BKT_${b.bucket}`];
  });
  permissions.secrets?.forEach(s => {
    if (!baseEnv[`SCRT_${s}`]) {
      throw new Error(`Secret environment variable for table ${s} not found in base environment`);
    }
    env[`SCRT_${s}`] = baseEnv[`SCRT_${s}`];
  });
  (permissions.queues || []).forEach(q => {
    if (!baseEnv[`Q_${q.queue}`]) {
      throw new Error(`Queue environment variable for table ${q.queue} not found in base environment`);
    }
    env[`Q_${q.queue}`] = baseEnv[`Q_${q.queue}`];
  });
  (permissions.firehoses || []).forEach(fh => {
    if (!baseEnv[`FH_${fh}`]) {
      throw new Error(`Firehose environment variable for table ${fh} not found in base environment`);
    }
    env[`FH_${fh}`] = baseEnv[`FH_${fh}`];
  });

  // Add email related environment variables
  if (permissions.extra?.includes('sendEmail')) {
    if (!baseEnv.EMAIL_SOURCE) {
      throw new Error('Email source environment variable not found in base environment');
    }
    env.EMAIL_SOURCE = baseEnv.EMAIL_SOURCE;
  }

  // Add the API code
  if (permissions.extra?.includes('apiCode')) {
    if (!baseEnv.API_CODE) {
      throw new Error('API code environment variable not found in base environment');
    }
    env.API_CODE = baseEnv.API_CODE;
  }

  // Add the Athena variables
  if (permissions.extra?.includes('athena') || permissions.extra?.includes('glue')) {
    if (!baseEnv.GLUE_TABLE || !baseEnv.GLUE_DATABASE || !baseEnv.ATHENA_WORKGROUP) {
      throw new Error('Glue/Athena environment variables not found in base environment');
    }
    env.GLUE_TABLE = baseEnv.GLUE_TABLE;
    env.GLUE_DATABASE = baseEnv.GLUE_DATABASE;
    env.ATHENA_WORKGROUP = baseEnv.ATHENA_WORKGROUP;
  }

  return env;
}

function grantLambdaPermissions(
  lambda: lambda.IFunction,
  permissions: LambdaPermissions,
  resources: LambdaResources
): void {
  permissions = _addApiPermissions(permissions);

  // Give permissions to send email
  if (permissions.extra?.includes('sendEmail')) {
    if (!resources.emailIdentity) {
      throw new Error('Email permissions requested but email identity not found in resources');
    }

    resources.emailIdentity.grantSendEmail(lambda);
  }

  // Add permissions for metrics
  if (permissions.extra?.includes('readMetrics')) {
    lambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [ 'cloudwatch:*', ],
      resources: [ '*', ],
    }));
  }
  if (permissions.extra?.includes('putMetrics')) {
    lambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [ 'cloudwatch:PutMetricData', ],
      resources: [ '*', ],
    }));
  }
  if (permissions.extra?.includes('readMetricsTags')) {
    lambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'cloudwatch:PutMetricData',
        'cloudwatch:ListTagsForResource',
      ],
      resources: [ '*', ],
    }));
  }

  // Add permissions for transcribe
  if (permissions.extra?.includes('transcribe')) {
    lambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [ 'transcribe:*', ],
      resources: [ '*', ],
    }));
  }

  // Add permissions for athena
  if (permissions.extra?.includes('athena')) {
    if (!resources.athenaPolicy) {
      throw new Error('Athena permissions requested but Athena policy not found in resources');
    }
    lambda.role?.addManagedPolicy(resources.athenaPolicy);
  }

  // Add permissions for glue
  if (permissions.extra?.includes('glue')) {
    if (!resources.gluePolicy) {
      throw new Error('Glue permissions requested but Glue policy not found in resources');
    }
    lambda.role?.addManagedPolicy(resources.gluePolicy);
  }

  // Give table permissions
  permissions.tables?.forEach(t => {
    const table = resources.tables[t.table];
    if (!table) {
      throw new Error(`Table permissions requested for table ${t.table} but not found in resources`);
    }

    if (t.readonly) {
      table.grantReadData(lambda);
    } else {
      table.grantReadWriteData(lambda);
    }
  });

  // Give bucket permissions
  permissions.buckets?.forEach(b => {
    const bucket = resources.buckets[b.bucket];
    if (!bucket) {
      throw new Error(`Table permissions requested for bucket ${b.bucket} but not found in resources`);
    }

    if (b.readonly) {
      bucket.grantRead(lambda);
    } else {
      bucket.grantReadWrite(lambda);
    }
  });

  // Give secret permissions
  permissions.secrets?.forEach(s => {
    const secret = resources.secrets[s];
    if (!secret) {
      throw new Error(`Table permissions requested for secret ${s} but not found in resources`);
    }

    secret.grantRead(lambda);
  });

  // Give queue permissions
  permissions.queues?.forEach(q => {
    const queue = resources.queues[q.queue];
    if (!queue) {
      throw new Error(`Table permissions requested for queue ${q.queue} but not found in resources`);
    }

    if (q.read) {
      queue.grantConsumeMessages(lambda);
    }
    if (q.write) {
      queue.grantSendMessages(lambda);
    }
  });

  // Give firehose permissions
  permissions.firehoses?.forEach(fh => {
    const firehose = resources.firehoses[fh];
    if (!firehose) {
      throw new Error(`Table permissions requested for firehose ${fh} but not found in resources`);
    }

    lambda.addToRolePolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: [ firehose.attrArn, ],
      actions: [
        'firehose:PutRecord',
        'firehose:PutRecordBatch',
      ],
    }));
  });
}

export class FireWatcherAwsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    Tags.of(this).add('CostCenter', 'COFRN');

    // Structure to hold resources that lambda functions can be given permissions for
    const lambdaResources: LambdaResources = {
      tables: {},
      buckets: {},
      secrets: {},
      queues: {},
      firehoses: {},
    };

    // Created outside of the CDK
    const bucket = s3.Bucket.fromBucketName(this, bucketName, bucketName);
    lambdaResources.buckets.AUDIO = bucket;
    const twilioSecret = secretsManager.Secret.fromSecretCompleteArn(this, 'cvfd-twilio-secret', secretArn);
    lambdaResources.secrets.TWILIO = twilioSecret;

    // Create the tables for dynamo DB
    const phoneNumberTable = new dynamodb.Table(this, 'cvfd-phone', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'phone',
        type: dynamodb.AttributeType.NUMBER,
      },
    });
    lambdaResources.tables.USER = phoneNumberTable;
    const dtrTable = new dynamodb.Table(this, 'cvfd-dtr-added', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'Talkgroup',
        type: dynamodb.AttributeType.NUMBER,
      },
      sortKey: {
        name: 'Added',
        type: dynamodb.AttributeType.NUMBER,
      },
    });
    lambdaResources.tables.FILE = dtrTable;
    const textsTable = new dynamodb.Table(this, 'cvfd-messages', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'datetime',
        type: dynamodb.AttributeType.NUMBER,
      },
    });
    lambdaResources.tables.TEXT = textsTable;
    const statusTable = new dynamodb.Table(this, 'cofrn-status', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'Server',
        type: dynamodb.AttributeType.STRING,
      },
    });
    lambdaResources.tables.STATUS = statusTable;
    const talkgroupTable = new dynamodb.Table(this, 'cvfd-talkgroups', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'ID',
        type: dynamodb.AttributeType.NUMBER,
      },
    });
    lambdaResources.tables.TALKGROUP = talkgroupTable;
    const siteTable = new dynamodb.Table(this, 'cvfd-sites', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'SiteId',
        type: dynamodb.AttributeType.STRING,
      },
    });
    lambdaResources.tables.SITE = siteTable;
    const dtrTranslationTable = new dynamodb.Table(this, 'cvfd-dtr-translation', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'Key',
        type: dynamodb.AttributeType.STRING,
      },
      timeToLiveAttribute: 'TTL',
    });
    lambdaResources.tables.DTR_TRANSLATION = dtrTranslationTable;
    const errorsTable = new dynamodb.Table(this, 'cofrn-frontend-errors', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'Datetime',
        type: dynamodb.AttributeType.NUMBER,
      },
    });
    lambdaResources.tables.ERROR = errorsTable;
    const devicesTable = new dynamodb.Table(this, 'cofrn-devices', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'RadioID',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'StartTime',
        type: dynamodb.AttributeType.NUMBER,
      },
    });
    lambdaResources.tables.DEVICES = devicesTable;
    const radiosTable = new dynamodb.Table(this, 'cofrn-radios', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'RadioID',
        type: dynamodb.AttributeType.STRING,
      },
    });
    lambdaResources.tables.RADIOS = radiosTable;
    const departmentsTable = new dynamodb.Table(this, 'cofrn-departments', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING,
      },
    });
    lambdaResources.tables.DEPARTMENT = departmentsTable;
    const invoicesTable = new dynamodb.Table(this, 'cofrn-invoices', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'id',
        type: dynamodb.AttributeType.STRING,
      },
    });
    lambdaResources.tables.INVOICE = invoicesTable;

    dtrTable.addGlobalSecondaryIndex({
      indexName: 'AddedIndex',
      partitionKey: {
        name: 'Emergency',
        type: dynamodb.AttributeType.NUMBER,
      },
      sortKey: {
        name: 'Added',
        type: dynamodb.AttributeType.NUMBER,
      },
    });
    dtrTable.addGlobalSecondaryIndex({
      indexName: 'StartTimeTgIndex',
      partitionKey: {
        name: 'Talkgroup',
        type: dynamodb.AttributeType.NUMBER,
      },
      sortKey: {
        name: 'StartTime',
        type: dynamodb.AttributeType.NUMBER,
      },
    });
    dtrTable.addGlobalSecondaryIndex({
      indexName: 'StartTimeEmergIndex',
      partitionKey: {
        name: 'Emergency',
        type: dynamodb.AttributeType.NUMBER,
      },
      sortKey: {
        name: 'StartTime',
        type: dynamodb.AttributeType.NUMBER,
      },
    });
    dtrTable.addGlobalSecondaryIndex({
      indexName: 'KeyIndex',
      partitionKey: {
        name: 'Key',
        type: dynamodb.AttributeType.STRING,
      },
    });
    dtrTable.addGlobalSecondaryIndex({
      indexName: 'ToneIndex',
      partitionKey: {
        name: 'ToneIndex',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'StartTime',
        type: dynamodb.AttributeType.NUMBER,
      },
    });

    talkgroupTable.addGlobalSecondaryIndex({
      indexName: 'InUseIndex',
      partitionKey: {
        name: 'InUse',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'Count',
        type: dynamodb.AttributeType.NUMBER,
      },
    });

    textsTable.addGlobalSecondaryIndex({
      indexName: 'testPageIndex',
      partitionKey: {
        name: 'testPageIndex',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'datetime',
        type: dynamodb.AttributeType.NUMBER,
      },
    });
    textsTable.addGlobalSecondaryIndex({
      indexName: 'typeIndex',
      partitionKey: {
        name: 'type',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'datetime',
        type: dynamodb.AttributeType.NUMBER,
      },
    });
    textsTable.addGlobalSecondaryIndex({
      indexName: 'departmentIndex',
      partitionKey: {
        name: 'department',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'datetime',
        type: dynamodb.AttributeType.NUMBER,
      },
    });

    siteTable.addGlobalSecondaryIndex({
      indexName: 'active',
      partitionKey: {
        name: 'IsActive',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // Make the S3 bucket for the kinesis stuff
    const eventsS3Bucket = new s3.Bucket(this, 'cvfd-events-bucket');
    lambdaResources.buckets.EVENTS = eventsS3Bucket;

    // Make the S3 bucket for caching cost data from AWS
    const costDataS3Bucket = new s3.Bucket(this, 'cvfd-costs-bucket');
    lambdaResources.buckets.COSTS = costDataS3Bucket;

    // Make the Glue table
    const glueDatabaseName = 'cvfd-data-db';
    const glueTableName = 'cvfd-dtr-events';
    const eventsGlueDatabase = new glue.CfnDatabase(this, 'cvfd-glue-database', {
      catalogId: glueCatalogId,
      databaseInput: {
        name: glueDatabaseName,
      },
    });
    const eventsGlueTable = new glue.CfnTable(this, 'cvfd-dtr-events-table', {
      databaseName: glueDatabaseName,
      catalogId: glueCatalogId,
      tableInput: {
        name: glueTableName,
        tableType: 'EXTERNAL_TABLE',
        partitionKeys: [
          {
            name: 'datetime',
            type: 'string',
          },
          {
            name: 'event',
            type: 'string',
          },
        ],
        storageDescriptor: {
          compressed: true,
          inputFormat: 'org.apache.hadoop.hive.ql.io.orc.OrcInputFormat',
          outputFormat: 'org.apache.hadoop.hive.ql.io.orc.OrcOutputFormat',
          serdeInfo: {
            serializationLibrary: 'org.apache.hadoop.hive.ql.io.orc.OrcSerde',
          },
          columns: [
            {
              name: 'radioId',
              type: 'string',
            },
            {
              name: 'talkgroup',
              type: 'string',
            },
            {
              name: 'talkgroupList',
              type: 'string',
            },
            {
              name: 'tower',
              type: 'string',
            },
            {
              name: 'timestamp',
              type: 'bigint',
            },
          ],
          location: eventsS3Bucket.s3UrlForObject() + '/data/',
        },
      },
    });
    eventsGlueTable.addDependency(eventsGlueDatabase);

    // Make the role
    const eventsFirehoseRole = new iam.Role(this, 'cvfd-events-firehose-role', {
      assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com'),
    });
    eventsS3Bucket.grantReadWrite(eventsFirehoseRole);
    eventsFirehoseRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: [
        `arn:aws:glue:${this.region}:${glueCatalogId}:table/*`,
        `arn:aws:glue:${this.region}:${glueCatalogId}:database/*`,
        `arn:aws:glue:${this.region}:${glueCatalogId}:catalog`,
      ],
      actions: [
        'glue:GetDatabase',
        'glue:GetTable',
        'glue:GetPartition*',
        'glue:GetTableVersions',
      ],
    }));
    eventsFirehoseRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: [ '*', ],
      actions: [
        'glue:GetDatabase',
        'glue:GetTable',
        'glue:GetPartition*',
        'glue:GetTableVersions',
      ],
    }));
    eventsFirehoseRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: [ '*', ],
      actions: [
        'logs:CreateLogGroup',
        'logs:PutLogEvents',
        'logs:CreateLogStream',
      ],
    }));

    // Make the kinesis firehose
    const eventsFirehose = new kinesisfirehose.CfnDeliveryStream(this, 'cvfd-events-firehose', {
      deliveryStreamName: 'cvfd-events-delivery-stream',
      extendedS3DestinationConfiguration: {
        bucketArn: eventsS3Bucket.bucketArn,
        roleArn: eventsFirehoseRole.roleArn,
        bufferingHints: {
          intervalInSeconds: 900, // Max value, 15 minutes
        },
        prefix: 'data/datetime=!{partitionKeyFromQuery:datePartition}/event=!{partitionKeyFromQuery:event}/',
        errorOutputPrefix: 'errors/!{firehose:error-output-type}/',
        dataFormatConversionConfiguration: {
          enabled: true,
          inputFormatConfiguration: {
            deserializer: { openXJsonSerDe: { }, },
          },
          outputFormatConfiguration: {
            serializer: { orcSerDe: { }, },
          },
          schemaConfiguration: {
            catalogId: eventsGlueTable.catalogId,
            roleArn: eventsFirehoseRole.roleArn,
            databaseName: eventsGlueTable.databaseName,
            tableName: glueTableName,
          },
        },
        processingConfiguration: {
          enabled: true,
          processors: [ {
            type: 'MetadataExtraction',
            parameters: [
              {
                parameterName: 'JsonParsingEngine',
                parameterValue: 'JQ-1.6',
              },
              {
                parameterName: 'MetadataExtractionQuery',
                parameterValue: '{event:.event, datePartition:.datePartition}',
              },
            ],
          }, ],
        },
        dynamicPartitioningConfiguration: { enabled: true, },
      },
    });
    lambdaResources.firehoses.EVENTS = eventsFirehose;

    // Create the dead letter queue
    const deadLetterQueue = new sqs.Queue(this, 'cvfd-error-queue');

    // Create the SQS queue
    const queue = new sqs.Queue(this, 'cvfd-queue', {
      visibilityTimeout: Duration.minutes(5),
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 2,
      },
    });
    lambdaResources.queues.EVENTS = queue;

    // Create a queue for twilio status events
    const twilioStatusQueue = new sqs.Queue(this, 'cofrn-twilio-status', {
      visibilityTimeout: Duration.minutes(5),
    });
    lambdaResources.queues.TWILIO = twilioStatusQueue;

    // Create the secret for JWT authentication
    const jwtSecret = new secretsManager.Secret(this, 'cofrn-jwt-secret', {
      description: 'The secret used for signing and verifying JWTs',
      generateSecretString: {
        excludeCharacters: 'ghijklmnopqrstuvwxyz',
        excludePunctuation: true,
        excludeUppercase: true,
        passwordLength: 64,
      },
    });
    lambdaResources.secrets.JWT = jwtSecret;

    // Create the secret for JWT authentication
    const aladTecSecret = new secretsManager.Secret(this, 'cofrn-aladtec-secret', {
      description: 'The username and password to use for logging into AladTec',
    });
    lambdaResources.secrets.ALADTEC = aladTecSecret;

    // Create the athena workgroup
    const athenaWorkgroup = new athena.CfnWorkGroup(this, 'cofrn-athena-workgroup', {
      name: 'COFRN-Athena-Workgroup',
      workGroupConfiguration: {
        resultConfiguration: {
          outputLocation: `s3://${eventsS3Bucket.bucketName}/results/`,
        },
      },
    });
    lambdaResources.athenaPolicy = iam.ManagedPolicy.fromManagedPolicyArn(
      this,
      'lambda-athena-policy',
      'arn:aws:iam::aws:policy/AmazonAthenaFullAccess'
    );
    lambdaResources.gluePolicy = iam.ManagedPolicy.fromManagedPolicyArn(
      this,
      'cofrn-full-glue-access',
      'arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole'
    );

    // Create resources for sending emails
    const emailIdentity = new ses.EmailIdentity(this, 'cvfd-email-identity', {
      identity: ses.Identity.domain(emailDomain),
      feedbackForwarding: true,
    });
    lambdaResources.emailIdentity = emailIdentity;
    const emailS3 = new s3.Bucket(this, 'cofrn-email-bucket');
    lambdaResources.buckets.EMAIL = emailS3;

    // Build the lambda environment variables
    const lambdaEnv: LambdaEnvironment = {
      // Tables
      TBL_DEVICES: devicesTable.tableName,
      TBL_DTR_TRANSLATION: dtrTranslationTable.tableName,
      TBL_ERROR: errorsTable.tableName,
      TBL_FILE: dtrTable.tableName,
      TBL_RADIOS: radiosTable.tableName,
      TBL_SITE: siteTable.tableName,
      TBL_STATUS: statusTable.tableName,
      TBL_TALKGROUP: talkgroupTable.tableName,
      TBL_TEXT: textsTable.tableName,
      TBL_USER: phoneNumberTable.tableName,
      TBL_DEPARTMENT: departmentsTable.tableName,
      TBL_INVOICE: invoicesTable.tableName,

      // Buckets
      BKT_AUDIO: bucket.bucketName,
      BKT_COSTS: costDataS3Bucket.bucketName,
      BKT_EVENTS: eventsS3Bucket.bucketName,
      BKT_EMAIL: emailS3.bucketName,

      // Secrets
      SCRT_ALADTEC: aladTecSecret.secretArn,
      SCRT_JWT: jwtSecret.secretArn,
      SCRT_TWILIO: twilioSecret.secretArn,

      // Queues
      Q_EVENTS: queue.queueUrl,
      Q_TWILIO: twilioStatusQueue.queueUrl,

      // Firehoses
      FH_EVENTS: eventsFirehose.deliveryStreamName as string,

      // @TODO
      API_CODE: process.env.SERVER_API_CODE as string,
      EMAIL_SOURCE: emailIdentity.emailIdentityArn,

      GLUE_TABLE: glueTableName,
      GLUE_DATABASE: glueDatabaseName,
      ATHENA_WORKGROUP: athenaWorkgroup.name,
    };

    // Create the lambda for forwarding emails
    const emailHandlerPermissions: LambdaPermissions = {
      extra: [ 'sendEmail', ],
      buckets: [ {
        bucket: 'EMAIL',
        readonly: true,
      }, ],
    };
    const emailHandler = new lambdanodejs.NodejsFunction(this, 'cofrn-email-lambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: resolve(resourceBase, 'emailHandler.ts'),
      handler: 'main',
      environment: buildLambdaEnvironment(lambdaEnv, emailHandlerPermissions),
      timeout: Duration.minutes(1),
      logRetention: logs.RetentionDays.ONE_MONTH,
    });
    grantLambdaPermissions(emailHandler, emailHandlerPermissions, lambdaResources);

    // Create the logic for receiving emails
    new ses.ReceiptRuleSet(this, 'cofrn-ses-rulest', {
      rules: [ {
        recipients: [ `billing@${emailDomain}`, ],
        actions: [
          new sesActions.S3({
            bucket: emailS3,
            objectKeyPrefix: 'emails/',
          }),
          new sesActions.Lambda({
            function: emailHandler,
          }),
        ],
      }, ],
    });

    // Invoice generation function
    const invoiceHandlerPermissions: LambdaPermissions = {
      extra: [ 'sendEmail', ],
      tables: [
        {
          table: 'DEPARTMENT',
          readonly: true,
        },
        {
          table: 'INVOICE',
          readonly: false,
        },
      ],
      buckets: [ {
        bucket: 'EMAIL',
        readonly: false,
      }, ],
      secrets: [ 'TWILIO', ],
    };
    const invoiceHandler = new lambdanodejs.NodejsFunction(this, 'cofrn-invoice-lambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: resolve(resourceBase, 'generateInvoices.ts'),
      handler: 'main',
      environment: buildLambdaEnvironment(lambdaEnv, invoiceHandlerPermissions),
      bundling: {
        nodeModules: [ 'pdfkit', ],
      },
      timeout: Duration.minutes(1),
      logRetention: logs.RetentionDays.ONE_MONTH,
    });
    grantLambdaPermissions(invoiceHandler, invoiceHandlerPermissions, lambdaResources);

    // Run the invoice function on the 3rd of every month at 9 AM
    const target = new schedulerTargets.LambdaInvoke(invoiceHandler, {
      input: scheduler.ScheduleTargetInput.fromObject({
        'payload': 'useful',
      }),
    });
    new scheduler.Schedule(this, 'cofrn-invoice-schedule', {
      schedule: scheduler.ScheduleExpression.cron({
        minute: '0',
        hour: '9',
        day: '2',
        timeZone: TimeZone.AMERICA_DENVER,
      }),
      target,
      description: 'This will generate invoices every month on the 1st at 0900 mountain time',
    });

    // Create a handler that pushes file information into Dynamo DB
    const s3HandlerPermissions: LambdaPermissions = {
      extra: [
        'transcribe',
        'putMetrics',
      ],
      buckets: [ {
        bucket: 'AUDIO',
        readonly: false,
      }, ],
      tables: [
        {
          table: 'FILE',
          readonly: false,
        },
        {
          table: 'TALKGROUP',
          readonly: false,
        },
        {
          table: 'DTR_TRANSLATION',
          readonly: false,
        },
        {
          table: 'DEVICES',
          readonly: false,
        },
        {
          table: 'RADIOS',
          readonly: false,
        },
      ],
      queues: [ {
        queue: 'EVENTS',
        read: false,
        write: true,
      }, ],
    };
    const s3Handler = new lambdanodejs.NodejsFunction(this, 'cvfd-s3-lambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: resolve(resourceBase, 's3.ts'),
      handler: 'main',
      environment: buildLambdaEnvironment(lambdaEnv, s3HandlerPermissions),
      timeout: Duration.minutes(1),
      logRetention: logs.RetentionDays.ONE_MONTH,
    });
    grantLambdaPermissions(s3Handler, s3HandlerPermissions, lambdaResources);

    // Create a handler for the SQS queue
    const queueHandlerPermissions: LambdaPermissions = {
      extra: [
        'putMetrics',
        'transcribe',
      ],
      tables: [
        {
          table: 'USER',
          readonly: false,
        },
        {
          table: 'TEXT',
          readonly: false,
        },
        {
          table: 'FILE',
          readonly: false,
        },
        {
          table: 'DTR_TRANSLATION',
          readonly: false,
        },
        {
          table: 'SITE',
          readonly: false,
        },
      ],
      buckets: [ {
        bucket: 'COSTS',
        readonly: false,
      }, ],
      secrets: [ 'TWILIO', ],
    };
    const queueHandler = new lambdanodejs.NodejsFunction(this, 'cvfd-queue-lambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: resolve(resourceBase, 'queue.ts'),
      handler: 'main',
      environment: buildLambdaEnvironment(lambdaEnv, queueHandlerPermissions),
      timeout: Duration.minutes(1),
      logRetention: logs.RetentionDays.ONE_MONTH,
    });
    queueHandler.addEventSource(new lambdaEventSources.SqsEventSource(queue));
    grantLambdaPermissions(queueHandler, queueHandlerPermissions, lambdaResources);

    // Create a handler for the S3 file creation SQS queue
    const eventsS3QueueHandlerPermissions: LambdaPermissions = {
      extra: [ 'glue', ],
      buckets: [ {
        bucket: 'EVENTS',
        readonly: true,
      }, ],
    };
    const eventsS3QueueHandler = new lambdanodejs.NodejsFunction(this, 'cvfd-events-s3-queue-lambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: resolve(resourceBase, 'eventFileQueueHandler.ts'),
      handler: 'main',
      environment: buildLambdaEnvironment(lambdaEnv, eventsS3QueueHandlerPermissions),
      timeout: Duration.minutes(5),
      logRetention: logs.RetentionDays.ONE_MONTH,
    });
    grantLambdaPermissions(eventsS3QueueHandler, eventsS3QueueHandlerPermissions, lambdaResources);

    // Pipe the S3 events to the handler
    eventsS3Bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3Notifications.LambdaDestination(eventsS3QueueHandler),
      {
        prefix: 'data/',
      }
    );

    // Create a queue and handler that handles Twilio status updates
    const twilioQueueHandlerPermissions: LambdaPermissions = {
      tables: [ {
        table: 'TEXT',
        readonly: false,
      }, ],
    };
    const twilioQueueHandler = new lambdanodejs.NodejsFunction(this, 'cofrn-twilio-queue-lambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: resolve(resourceBase, 'twilioQueueHandler.ts'),
      handler: 'main',
      environment: buildLambdaEnvironment(lambdaEnv, twilioQueueHandlerPermissions),
      timeout: Duration.minutes(1),
      logRetention: logs.RetentionDays.ONE_MONTH,
    });
    grantLambdaPermissions(twilioQueueHandler, twilioQueueHandlerPermissions, lambdaResources);
    twilioQueueHandler.addEventSource(new lambdaEventSources.SqsEventSource(twilioStatusQueue, {
      batchSize: 10,
      maxBatchingWindow: Duration.minutes(1),
    }));

    // Create a queue for cloudwatch alarms
    const alarmQueueHandlerPermissions: LambdaPermissions = {
      extra: [
        'putMetrics',
        'readMetricsTags',
      ],
      tables: [
        {
          table: 'TEXT',
          readonly: false,
        },
        {
          table: 'USER',
          readonly: true,
        },
      ],
      secrets: [ 'TWILIO', ],
      buckets: [ {
        bucket: 'COSTS',
        readonly: false,
      }, ],
    };
    const alarmQueueHandler = new lambdanodejs.NodejsFunction(this, 'cvfd-alarm-queue-lambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: resolve(resourceBase, 'alarms.ts'),
      handler: 'main',
      timeout: Duration.seconds(30),
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: buildLambdaEnvironment(lambdaEnv, alarmQueueHandlerPermissions),
    });
    grantLambdaPermissions(alarmQueueHandler, alarmQueueHandlerPermissions, lambdaResources);

    // Schedule the function for every 5 minutes
    const alarmEventRule = new events.Rule(this, 'alarm-rule', {
      schedule: events.Schedule.cron({
        minute: '*/5',
      }),
    });
    alarmEventRule.addTarget(new targets.LambdaFunction(alarmQueueHandler));

    const alarmAction = new cw_actions.LambdaAction(alarmQueueHandler);

    // Create the event trigger
    const s3Destination = new s3Notifications.LambdaDestination(s3Handler);
    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      s3Destination,
      {
        prefix: 'audio/',
      }
    );
    bucket.addEventNotification(
      s3.EventType.OBJECT_REMOVED,
      s3Destination,
      {
        prefix: 'audio/',
      }
    );

    // Create the EventBridge link between the transcribe service and queue
    const rule = new events.Rule(this, 'cvfd-event-rule', {
      eventPattern: {
        source: [ 'aws.transcribe', ],
        detail: {
          TranscriptionJobStatus: [ 'COMPLETED', ],
        },
      },
    });
    rule.addTarget(new targets.SqsQueue(queue));

    // Create the status parser function
    const statusHandlerPermissions: LambdaPermissions = {
      extra: [ 'putMetrics', ],
      tables: [
        {
          table: 'STATUS',
          readonly: false,
        },
        {
          table: 'USER',
          readonly: true,
        },
        {
          table: 'TEXT',
          readonly: false,
        },
      ],
      secrets: [ 'TWILIO', ],
    };
    const statusHandler = new lambdanodejs.NodejsFunction(this, 'cvfd-status-lambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: resolve(resourceBase, 'status.ts'),
      handler: 'main',
      environment: buildLambdaEnvironment(lambdaEnv, statusHandlerPermissions),
      timeout: Duration.minutes(1),
      logRetention: logs.RetentionDays.ONE_MONTH,
    });
    grantLambdaPermissions(statusHandler, statusHandlerPermissions, lambdaResources);

    // Schedule the function for every minute
    const statusEventRule = new events.Rule(this, 'status-rule', {
      schedule: events.Schedule.cron({
        minute: '*',
      }),
    });
    statusEventRule.addTarget(new targets.LambdaFunction(statusHandler));

    // Import the AladTec schedule
    const importAladTecPermissions: LambdaPermissions = {
      secrets: [ 'ALADTEC', ],
      buckets: [ {
        bucket: 'COSTS',
        readonly: false,
      }, ],
    };
    const importAladTec = new lambdanodejs.NodejsFunction(this, 'cofrn-import-aladtec', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: resolve(resourceBase, 'importAladTec.ts'),
      handler: 'main',
      environment: buildLambdaEnvironment(lambdaEnv, importAladTecPermissions),
      timeout: Duration.minutes(15),
      logRetention: logs.RetentionDays.ONE_WEEK,
    });
    grantLambdaPermissions(importAladTec, importAladTecPermissions, lambdaResources);

    // Update the schedule every 6 hours
    const importAladTecEventRule = new events.Rule(this, 'import-aladtec-rule', {
      schedule: events.Schedule.cron({
        hour: '*/6',
        minute: '0',
      }),
    });
    importAladTecEventRule.addTarget(new targets.LambdaFunction(importAladTec));

    // Update the event counts daily
    const dailyEventsHandlerPermissions: LambdaPermissions = {
      extra: [ 'athena', ],
      tables: [
        {
          table: 'DEVICES',
          readonly: false,
        },
        {
          table: 'RADIOS',
          readonly: false,
        },
        {
          table: 'TALKGROUP',
          readonly: false,
        },
        {
          table: 'FILE',
          readonly: true,
        },
      ],
      buckets: [ {
        bucket: 'EVENTS',
        readonly: false,
      }, ],
    };
    const dailyEventsHandler = new lambdanodejs.NodejsFunction(this, 'cofrn-daily-events', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: resolve(resourceBase, 'dailyEvents.ts'),
      handler: 'main',
      environment: buildLambdaEnvironment(lambdaEnv, dailyEventsHandlerPermissions),
      timeout: Duration.minutes(15),
      logRetention: logs.RetentionDays.ONE_WEEK,
    });
    grantLambdaPermissions(dailyEventsHandler, dailyEventsHandlerPermissions, lambdaResources);

    // Schedule the function for 1 AM UTC
    const dailyEventRule = new events.Rule(this, 'daily-events-rule', {
      schedule: events.Schedule.cron({
        hour: '1',
        minute: '0',
      }),
    });
    dailyEventRule.addTarget(new targets.LambdaFunction(dailyEventsHandler));

    // Create the weather updater
    const weatherUpdaterPermissions: LambdaPermissions = {
      buckets: [ {
        bucket: 'AUDIO',
        readonly: false,
      }, ],
    };
    const weatherUpdater = new lambdanodejs.NodejsFunction(this, 'cvfd-weather-lambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: resolve(resourceBase, 'weather.ts'),
      handler: 'main',
      environment: buildLambdaEnvironment(lambdaEnv, weatherUpdaterPermissions),
      timeout: Duration.minutes(5),
      logRetention: logs.RetentionDays.ONE_MONTH,
    });
    grantLambdaPermissions(weatherUpdater, weatherUpdaterPermissions, lambdaResources);

    // Schedule the function for every 15 minutes
    const weatherEventRule = new events.Rule(this, '-rule', {
      schedule: events.Schedule.cron({
        minute: '*/15',
      }),
    });
    weatherEventRule.addTarget(new targets.LambdaFunction(weatherUpdater));

    // Store APIs that should get a list of URLs -> lambda functions and that mapping
    const lambdaNameRecips: lambdanodejs.NodejsFunction[] = [];
    const lambdaNames: { [key: string]: string } = {
      'I_QUEUE': queueHandler.functionName,
      'I_S3': s3Handler.functionName,
      'I_ALARM_QUEUE': alarmQueueHandler.functionName,
      'I_STATUS': statusHandler.functionName,
      'I_WEATHER': weatherUpdater.functionName,
      'I_TWILIO_QUEUE': twilioQueueHandler.functionName,
      'I_EVENTS_S3_QUEUE': eventsS3QueueHandler.functionName,
      'I_EMAIL': emailHandler.functionName,
    };

    // Create a rest API
    const api = new apigateway.RestApi(this, 'cvfd-api-gateway', {
      restApiName: 'CVFD API Gateway',
      description: 'Allow interaction from the CVFD radio website',
      deployOptions: {
        loggingLevel: apigateway.MethodLoggingLevel.ERROR,
      },
    });
    const apiResource = api.root.addResource('api');

    // Add the v2 APIs
    const apiV2 = apiResource.addResource('v2');
    interface V2ApiConfigBase {
      pathPart: string;
      next?: V2ApiConfig[];
      api: false;
    }
    interface V2ApiConfigHandler extends Omit<V2ApiConfigBase, 'api'>, Omit<LambdaPermissions, 'api'>, Required<Pick<LambdaPermissions, 'api'>> {
      fileName: string;
      methods: (keyof typeof HTTPMethod)[];
    }
    type V2ApiConfig = V2ApiConfigBase | V2ApiConfigHandler;
    const v2Apis: V2ApiConfig[] = [
      // aladtec
      {
        pathPart: 'aladtec',
        fileName: 'aladtec',
        methods: [ 'GET', ],
        api: true,
        buckets: [ {
          bucket: 'COSTS',
          readonly: true,
        }, ],
      },
      // departments
      {
        pathPart: 'departments',
        fileName: 'departments',
        api: true,
        methods: [
          'GET',
          'POST',
        ],
        tables: [ {
          table: 'DEPARTMENT',
          readonly: false,
        }, ],
        next: [ {
          pathPart: '{id}',
          fileName: 'department',
          api: true,
          methods: [
            'GET',
            'PATCH',
          ],
          tables: [ {
            table: 'DEPARTMENT',
            readonly: false,
          }, ],
        }, ],
      },
      // errors
      {
        pathPart: 'errors',
        fileName: 'errors',
        api: true,
        methods: [
          'POST',
          'GET',
        ],
        tables: [ {
          table: 'ERROR',
          readonly: false,
        }, ],
      },
      // events
      {
        pathPart: 'events',
        fileName: 'events',
        api: true,
        methods: [
          'POST',
          'GET',
        ],
        extra: [
          'athena',
          'apiCode',
        ],
        firehoses: [ 'EVENTS', ],
        buckets: [ {
          bucket: 'EVENTS',
          readonly: false,
        }, ],
        next: [ {
          pathPart: '{type}',
          api: false,
          next: [ {
            pathPart: '{id}',
            fileName: 'eventsList',
            api: true,
            methods: [ 'GET', ],
            extra: [
              'athena',
              'apiCode',
            ],
            buckets: [ {
              bucket: 'EVENTS',
              readonly: false,
            }, ],
            tables: [
              {
                table: 'FILE',
                readonly: true,
              },
              {
                table: 'DEVICES',
                readonly: true,
              },
            ],
          }, ],
        }, ],
      },
      // files
      {
        pathPart: 'files',
        fileName: 'files',
        api: true,
        methods: [ 'GET', ],
        tables: [
          {
            table: 'FILE',
            readonly: true,
          },
          {
            table: 'DEVICES',
            readonly: true,
          },
        ],
        next: [ {
          pathPart: '{id}',
          fileName: 'file',
          api: true,
          methods: [ 'GET', ],
          tables: [ {
            table: 'FILE',
            readonly: true,
          }, ],
        }, ],
      },
      // heartbeats
      {
        pathPart: 'heartbeats',
        fileName: 'heartbeats',
        api: true,
        extra: [
          'putMetrics',
          'apiCode',
        ],
        methods: [
          'GET',
          'POST',
        ],
        tables: [ {
          table: 'STATUS',
          readonly: false,
        }, ],
      },
      // invoices
      {
        pathPart: 'invoices',
        api: false,
        next: [ {
          pathPart: '{id}',
          api: false,
          next: [ {
            pathPart: 'items',
            fileName: 'invoiceItems',
            api: true,
            methods: [ 'GET', ],
            secrets: [ 'TWILIO', ],
          }, ],
        }, ],
      },
      // login
      {
        pathPart: 'login',
        api: false,
        next: [ {
          pathPart: '{id}',
          fileName: 'login',
          api: true,
          methods: [
            'GET',
            'POST',
          ],
          tables: [ {
            table: 'USER',
            readonly: false,
          }, ],
          queues: [ {
            queue: 'EVENTS',
            read: false,
            write: true,
          }, ],
        }, ],
      },
      // logout
      {
        pathPart: 'logout',
        fileName: 'logout',
        api: true,
        methods: [ 'GET', ],
      },
      // metrics
      {
        pathPart: 'metrics',
        fileName: 'metrics',
        api: true,
        methods: [ 'POST', ],
        extra: [
          'readMetrics',
          'apiCode',
        ],
        next: [ {
          pathPart: 'add',
          fileName: 'metricsAdd',
          api: true,
          extra: [
            'putMetrics',
            'apiCode',
          ],
          methods: [ 'POST', ],
        }, ],
      },
      // pages
      {
        pathPart: 'pages',
        fileName: 'pages',
        api: true,
        methods: [ 'GET', ],
        tables: [ {
          table: 'FILE',
          readonly: true,
        }, ],
      },
      // radios
      {
        pathPart: 'radios',
        fileName: 'radios',
        api: true,
        methods: [ 'GET', ],
        tables: [ {
          table: 'RADIOS',
          readonly: true,
        }, ],
        next: [ {
          pathPart: '{id}',
          fileName: 'radio',
          api: true,
          methods: [ 'PATCH', ],
          tables: [ {
            table: 'RADIOS',
            readonly: false,
          }, ],
        }, ],
      },
      // restart
      {
        pathPart: 'restart',
        api: false,
        next: [ {
          pathPart: '{tower}',
          fileName: 'restart',
          api: true,
          methods: [
            'GET',
            'POST',
          ],
          extra: [ 'putMetrics', ],
          buckets: [ {
            bucket: 'COSTS',
            readonly: true,
          }, ],
          tables: [ {
            table: 'TEXT',
            readonly: false,
          }, ],
          secrets: [ 'TWILIO', ],
        }, ],
      },
      // sites
      {
        pathPart: 'sites',
        fileName: 'sites',
        api: true,
        methods: [
          'GET',
          'POST',
        ],
        extra: [ 'apiCode', ],
        tables: [ {
          table: 'SITE',
          readonly: true,
        }, ],
        queues: [ {
          queue: 'EVENTS',
          read: false,
          write: true,
        }, ],
      },
      // talkgroups
      {
        pathPart: 'talkgroups',
        fileName: 'talkgroups',
        api: true,
        methods: [ 'GET', ],
        tables: [ {
          table: 'TALKGROUP',
          readonly: true,
        }, ],
        next: [ {
          pathPart: '{id}',
          fileName: 'talkgroup',
          api: true,
          methods: [
            'GET',
            'PATCH',
          ],
          tables: [ {
            table: 'TALKGROUP',
            readonly: false,
          }, ],
        }, ],
      },
      // textlink
      {
        pathPart: 'textlink',
        fileName: 'textlink',
        api: true,
        methods: [ 'GET', ],
        tables: [ {
          table: 'TEXT',
          readonly: false,
        }, ],
      },
      // texts
      {
        pathPart: 'texts',
        fileName: 'texts',
        api: true,
        methods: [ 'GET', ],
        tables: [ {
          table: 'TEXT',
          readonly: true,
        }, ],
        buckets: [ {
          bucket: 'COSTS',
          readonly: true,
        }, ],
        next: [ {
          pathPart: '{id}',
          fileName: 'text',
          api: true,
          methods: [ 'PATCH', ],
          tables: [ {
            table: 'TEXT',
            readonly: false,
          }, ],
        }, ],
      },
      // twilio
      {
        pathPart: 'twilio',
        fileName: 'twilioBase',
        api: true,
        methods: [ 'POST', ],
        secrets: [ 'TWILIO', ],
        tables: [ {
          table: 'USER',
          readonly: false,
        }, ],
        queues: [ {
          queue: 'EVENTS',
          read: false,
          write: true,
        }, ],
        next: [ {
          pathPart: '{id}',
          fileName: 'twilioStatus',
          api: true,
          methods: [ 'POST', ],
          extra: [ 'putMetrics', ],
          secrets: [ 'TWILIO', ],
          tables: [
            {
              table: 'TEXT',
              readonly: false,
            },
            {
              table: 'USER',
              readonly: false,
            },
          ],
          queues: [
            {
              queue: 'EVENTS',
              read: false,
              write: true,
            },
            {
              queue: 'TWILIO',
              read: false,
              write: true,
            },
          ],
        }, ],
      },
      // users
      {
        pathPart: 'users',
        fileName: 'users',
        api: true,
        methods: [
          'GET',
          'POST',
        ],
        tables: [ {
          table: 'USER',
          readonly: false,
        }, ],
        queues: [ {
          queue: 'EVENTS',
          read: false,
          write: true,
        }, ],
        next: [ {
          pathPart: '{id}',
          fileName: 'user',
          api: true,
          methods: [
            'GET',
            'PATCH',
            'DELETE',
          ],
          tables: [ {
            table: 'USER',
            readonly: false,
          }, ],
          queues: [ {
            queue: 'EVENTS',
            read: false,
            write: true,
          }, ],
          next: [ {
            pathPart: '{department}',
            fileName: 'userDepartment',
            api: true,
            methods: [
              'POST',
              'PATCH',
              'DELETE',
            ],
            tables: [ {
              table: 'USER',
              readonly: false,
            }, ],
            queues: [ {
              queue: 'EVENTS',
              read: false,
              write: true,
            }, ],
          }, ],
        }, ],
      },
    ];
    const createApi = (
      baseResource: apigateway.Resource,
      config: V2ApiConfig
    ) => {
      let resourceIntegration: apigateway.Integration | undefined = undefined;
      let resourceHandler: lambdanodejs.NodejsFunction | undefined = undefined;
      if ('fileName' in config) {
        resourceHandler = new lambdanodejs.NodejsFunction(this, `cofrn-api-v2-${config.fileName}`, {
          runtime: lambda.Runtime.NODEJS_22_X,
          entry: resolve(resourceBase, 'api', 'v2', `${config.fileName}.ts`),
          handler: 'main',
          timeout: Duration.seconds(20),
          logRetention: logs.RetentionDays.ONE_MONTH,
          environment: buildLambdaEnvironment(lambdaEnv, config),
        });
        grantLambdaPermissions(resourceHandler, config, lambdaResources);

        resourceIntegration = new apigateway.LambdaIntegration(resourceHandler, {
          requestTemplates: {
            'application/json': '{"statusCode":"200"}',
          },
        });
        if (config.extra?.includes('readMetrics')) {
          lambdaNameRecips.push(resourceHandler);
        }
      }

      // Add the resource
      const apiResource = baseResource.addResource(config.pathPart);
      if ('fileName' in config && resourceIntegration) {
        config.methods.forEach(method => apiResource.addMethod(method, resourceIntegration));
      }
      if ('fileName' in config && resourceHandler) {
        const envName = apiResource.path
          .replace(/[\{\}]/g, '')
          .replace(/\//, '')
          .replace(/\//g, '_')
          .toUpperCase();
        lambdaNames[`A_${envName}`] = resourceHandler.functionName;
      }

      // Handle the child APIs
      config.next?.forEach(conf => createApi(apiResource, conf));
    };
    v2Apis.forEach(conf => createApi(apiV2, conf));

    // Add the environment to the metric APIs
    Object.keys(lambdaNames).forEach(key => lambdaNameRecips.forEach(fn => {
      fn.addEnvironment(`${key}_FN_NAME`, lambdaNames[key] === fn.functionName ? 'self' : lambdaNames[key]);
    }));

    // Create a role for cloudfront to use to access s3
    const s3AccessIdentity = new cloudfront.OriginAccessIdentity(this, 'cvfd-cloudfront-identity');

    // We have to build the whole policy because CDK is stupid
    const s3ReadPolicy = new iam.PolicyStatement();
    s3ReadPolicy.addActions('s3:GetBucket*');
    s3ReadPolicy.addActions('s3:GetObject*');
    s3ReadPolicy.addActions('s3:List*');
    s3ReadPolicy.addResources(bucket.bucketArn);
    s3ReadPolicy.addResources(`${bucket.bucketArn}/*`);
    s3ReadPolicy.addCanonicalUserPrincipal(
      s3AccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId
    );

    // Add the new policy to the bucket
    if (!bucket.policy) {
      new s3.BucketPolicy(this, 'cvfd-s3-policy', {
        bucket,
      }).document.addStatements(s3ReadPolicy);
    } else {
      bucket.policy.document.addStatements(s3ReadPolicy);
    }

    // Create a function that handles redirecting and index.html
    const redirectCfFunction = new cloudfront.Function(this, 'cofrn-cloudfront-redirect', {
      code: cloudfront.FunctionCode.fromFile({
        filePath: resolve(resourceBase, 'redirect_function.js'),
      }),
      runtime: cloudfront.FunctionRuntime.JS_2_0,
    });

    // Create S3 bucket for react website
    const reactBucket = new s3.Bucket(this, 'cofrn-website');

    // Create the cloudfront distribution
    const cfDistro = new cloudfront.Distribution(this, 'cofrn-cloudfront', {
      certificate: acm.Certificate.fromCertificateArn(this, 'cofrn-cert', certArn),
      domainNames: [
        'new.cofrn.org',
        'cofrn.org',
        'www.cofrn.org',
        'fire.klawil.net',
      ],
      errorResponses: [ {
        httpStatus: 404,
        responsePagePath: '/404/index.html',
        ttl: Duration.minutes(30),
      }, ],
      defaultBehavior: {
        origin: cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(reactBucket, {
          originAccessLevels: [
            cloudfront.AccessLevel.READ,
            cloudfront.AccessLevel.LIST,
          ],
        }),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [ {
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          function: redirectCfFunction,
        }, ],
      },
      additionalBehaviors: {
        '/weather.json': {
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          origin: cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(bucket),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          functionAssociations: [ {
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            function: redirectCfFunction,
          }, ],
        },
        '/audio/*': {
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED_FOR_UNCOMPRESSED_OBJECTS,
          origin: cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(bucket),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
          functionAssociations: [ {
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            function: redirectCfFunction,
          }, ],
        },
        '/text-link': {
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          origin: new cloudfrontOrigins.HttpOrigin(
            `${api.restApiId}.execute-api.${this.region}.${this.urlSuffix}`,
            {
              originPath: `/${api.deploymentStage.stageName}`,
            }
          ),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          functionAssociations: [ {
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            function: redirectCfFunction,
          }, ],
        },
        '/api/*': {
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          origin: new cloudfrontOrigins.HttpOrigin(
            `${api.restApiId}.execute-api.${this.region}.${this.urlSuffix}`,
            {
              originPath: `/${api.deploymentStage.stageName}`,
            }
          ),
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          functionAssociations: [ {
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
            function: redirectCfFunction,
          }, ],
        },
      },
    });
    if (process.env.DEPLOY_FRONTEND) {
      new s3Deploy.BucketDeployment(this, 'deploy-website', {
        sources: [ s3Deploy.Source.asset(
          resolve(
            __dirname,
            '..', // stack
            '..', // src
            '..', // root
            'output',
            'build'
          )
        ), ],
        destinationBucket: reactBucket,
        distribution: cfDistro,
        memoryLimit: 1024,
      });
    }

    // Add the alarms
    const baseTowerAlarmConfig: cloudwatch.AlarmProps = {
      evaluationPeriods: 48,
      datapointsToAlarm: 48,
      metric: new cloudwatch.Metric({
        metricName: 'Decode Rate',
        namespace: 'DTR Metrics',
        period: Duration.minutes(5),
        statistic: cloudwatch.Stats.AVERAGE,
        dimensionsMap: {
          Tower: 'Saguache',
        },
      }),
      threshold: 30,
      alarmDescription: 'Recording audio from the Saguache Tower may not be occurring on may only be occurring intermitently',
      alarmName: 'Saguache Tower Decode Rate',
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.IGNORE,
    };
    const baseTowerOfflineAlarmConfig: cloudwatch.AlarmProps = {
      evaluationPeriods: 5,
      datapointsToAlarm: 5,
      metric: new cloudwatch.Metric({
        metricName: 'Decode Rate',
        namespace: 'DTR Metrics',
        period: Duration.minutes(1),
        statistic: cloudwatch.Stats.MINIMUM,
        dimensionsMap: {
          Tower: 'Saguache',
        },
      }),
      threshold: 0,
      alarmDescription: 'The server recording Saguache tower is offline',
      alarmName: 'Saguache Recorder Status',
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    };
    const baseUploadAlarmConfig: cloudwatch.AlarmProps = {
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      metric: new cloudwatch.Metric({
        metricName: 'UploadTime',
        namespace: 'DTR Metrics',
        period: Duration.hours(1),
        statistic: cloudwatch.Stats.SAMPLE_COUNT,
        dimensionsMap: {
          Tower: 'Saguache',
        },
      }),
      threshold: 0,
      alarmDescription: 'No files have been uploaded for Saguache Tower in the past 6 hours which may indicate the tower is not being recorded',
      alarmName: 'Saguache Tower Uploads',
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    };
    const alarms: CvfdAlarm[] = [
      { // Saguache tower not decoding
        tag: 'Dtr',
        codeName: 'saguache-tower',
        okayAction: true,
        alarm: {
          ...baseTowerAlarmConfig,
        },
      },
      { // Saguache recorder offline
        tag: 'Dtr',
        codeName: 'saguache-tower-offline',
        okayAction: true,
        alarm: {
          ...baseTowerOfflineAlarmConfig,
        },
      },
      { // Crestone recorder offline
        tag: 'Dtr',
        codeName: 'pool-table-offline',
        okayAction: true,
        alarm: {
          ...baseTowerOfflineAlarmConfig,
          metric: new cloudwatch.Metric({
            metricName: 'Decode Rate',
            namespace: 'DTR Metrics',
            period: Duration.minutes(1),
            statistic: cloudwatch.Stats.MINIMUM,
            dimensionsMap: {
              Tower: 'PoolTable',
            },
          }),
          alarmDescription: 'The server recording Pool Table tower is offline',
          alarmName: 'Crestone Recorder Status',
        },
      },
      { // Saguache tower down
        tag: 'Dtr',
        codeName: 'saguache-tower-upload',
        okayAction: true,
        alarm: {
          ...baseUploadAlarmConfig,
          evaluationPeriods: 6,
          datapointsToAlarm: 6,
        },
      },
      { // Pool table tower down
        tag: 'Dtr',
        codeName: 'pool-table-upload',
        okayAction: true,
        alarm: {
          ...baseUploadAlarmConfig,
          metric: new cloudwatch.Metric({
            metricName: 'UploadTime',
            namespace: 'DTR Metrics',
            period: Duration.hours(1),
            statistic: cloudwatch.Stats.SAMPLE_COUNT,
            dimensionsMap: {
              Tower: 'PoolTable',
            },
          }),
          alarmDescription: 'No files have been uploaded for Pool Table Tower in the past 6 hours which may indicate the tower is not being recorded',
          alarmName: 'Pool Table Uploads',
        },
      },
      { // API 5XX errors
        tag: 'Api',
        codeName: 'api5xx',
        okayAction: true,
        alarm: {
          evaluationPeriods: 1,
          datapointsToAlarm: 1,
          threshold: 0,
          alarmDescription: 'COFRN API is giving 5XX responses',
          alarmName: 'COFRN API 5XX',
          comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
          metric: new cloudwatch.Metric({
            metricName: '5XXError',
            namespace: 'AWS/ApiGateway',
            period: Duration.minutes(15),
            statistic: cloudwatch.Stats.SUM,
            dimensionsMap: {
              ApiName: api.restApiName,
            },
          }),
        },
      },
      { // Queue errors
        tag: 'Api',
        codeName: 'queue-handler',
        okayAction: false,
        alarm: {
          evaluationPeriods: 1,
          datapointsToAlarm: 1,
          threshold: 0,
          alarmDescription: 'The queue handler is throwing errors',
          alarmName: 'Queue Errors',
          comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
          metric: new cloudwatch.Metric({
            metricName: 'Errors',
            namespace: 'AWS/Lambda',
            period: Duration.minutes(15),
            statistic: cloudwatch.Stats.SUM,
            dimensionsMap: {
              FunctionName: queueHandler.functionName,
            },
          }),
        },
      },
      { // S3 errors
        tag: 'Api',
        codeName: 's3-handler',
        okayAction: false,
        alarm: {
          evaluationPeriods: 1,
          datapointsToAlarm: 1,
          threshold: 0,
          alarmDescription: 'The S3 event handler is throwing errors',
          alarmName: 'S3 Errors',
          comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
          metric: new cloudwatch.Metric({
            metricName: 'Errors',
            namespace: 'AWS/Lambda',
            period: Duration.minutes(15),
            statistic: cloudwatch.Stats.SUM,
            dimensionsMap: {
              FunctionName: s3Handler.functionName,
            },
          }),
        },
      },
      { // Failed Twilio texts
        tag: 'Api',
        codeName: 'twilio-failed',
        okayAction: false,
        alarm: {
          evaluationPeriods: 1,
          datapointsToAlarm: 1,
          threshold: 0,
          alarmDescription: 'Twilio texts were marked as failed',
          alarmName: 'Twilio Errors',
          comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
          treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
          metric: new cloudwatch.Metric({
            metricName: 'FailedTime',
            namespace: 'Twilio Health',
            period: Duration.minutes(15),
            statistic: cloudwatch.Stats.SAMPLE_COUNT,
          }),
        },
      },
    ];

    alarms.forEach(alarmConfig => {
      const alarm = new cloudwatch.Alarm(this, `cvfd-alarm-${alarmConfig.codeName}`, alarmConfig.alarm);
      alarm.addAlarmAction(alarmAction);
      if (alarmConfig.okayAction !== false) {
        alarm.addOkAction(alarmAction);
      }

      Tags.of(alarm).add('cofrn-alarm-type', alarmConfig.tag);
    });
  }
}
