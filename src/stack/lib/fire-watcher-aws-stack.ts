import { resolve } from 'path';

import {
  CfnOutput,
  Duration,
  Stack, StackProps, Tags
} from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
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
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3Deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as s3Notifications from 'aws-cdk-lib/aws-s3-notifications';
import * as secretsManager from 'aws-cdk-lib/aws-secretsmanager';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Construct } from 'constructs';
import * as dotenv from 'dotenv';
import { HTTPMethod } from 'ts-oas';

import { LambdaEnvironment } from '@/types/backend/environment';

dotenv.config({ path: resolve(
  __dirname,
  '..', // stack
  '..', // src
  '..', // root
  '.env'
), });

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

type AlarmTag = 'Dtr' | 'Api';
interface CvfdAlarm {
  tag: AlarmTag;
  codeName: string;
  okayAction?: boolean;
  alarm: cloudwatch.AlarmProps;
}

export class FireWatcherAwsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Created outside of the CDK
    const bucket = s3.Bucket.fromBucketName(this, bucketName, bucketName);
    const twilioSecret = secretsManager.Secret.fromSecretCompleteArn(this, 'cvfd-twilio-secret', secretArn);

    // Create the tables for dynamo DB
    const phoneNumberTable = new dynamodb.Table(this, 'cvfd-phone', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'phone',
        type: dynamodb.AttributeType.NUMBER,
      },
    });
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
    const textsTable = new dynamodb.Table(this, 'cvfd-messages', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'datetime',
        type: dynamodb.AttributeType.NUMBER,
      },
    });
    const statusTable = new dynamodb.Table(this, 'cofrn-status', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'Server',
        type: dynamodb.AttributeType.STRING,
      },
    });
    const talkgroupTable = new dynamodb.Table(this, 'cvfd-talkgroups', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'ID',
        type: dynamodb.AttributeType.NUMBER,
      },
    });
    const siteTable = new dynamodb.Table(this, 'cvfd-sites', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'SiteId',
        type: dynamodb.AttributeType.STRING,
      },
    });
    const dtrTranslationTable = new dynamodb.Table(this, 'cvfd-dtr-translation', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'Key',
        type: dynamodb.AttributeType.STRING,
      },
      timeToLiveAttribute: 'TTL',
    });

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
    const eventsS3BucketQueue = new sqs.Queue(this, 'cvfd-events-queue');
    const eventsS3BucketQueueDestination = new s3Notifications.SqsDestination(eventsS3BucketQueue);
    eventsS3Bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      eventsS3BucketQueueDestination,
      { prefix: 'data/', }
    );
    eventsS3Bucket.addEventNotification(
      s3.EventType.OBJECT_REMOVED,
      eventsS3BucketQueueDestination,
      { prefix: 'data/', }
    );

    // Make the S3 bucket for caching cost data from AWS
    const costDataS3Bucket = new s3.Bucket(this, 'cvfd-costs-bucket');

    // Make the Glue table
    const glueDatabaseName = 'cvfd-data-db';
    const glueTableName = 'cvfd-radio-events';
    const eventsGlueDatabase = new glue.CfnDatabase(this, 'cvfd-glue-database', {
      catalogId: glueCatalogId,
      databaseInput: {
        name: glueDatabaseName,
      },
    });
    const eventsGlueTable = new glue.CfnTable(this, 'cvfd-events-table', {
      databaseName: glueDatabaseName,
      catalogId: glueCatalogId,
      tableInput: {
        name: glueTableName,
        tableType: 'EXTERNAL_TABLE',
        partitionKeys: [
          {
            name: 'year', type: 'int',
          },
          {
            name: 'month', type: 'int',
          },
          {
            name: 'day', type: 'int',
          },
          {
            name: 'hour', type: 'int',
          },
          {
            name: 'event', type: 'string',
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
              name: 'radioId', type: 'string',
            },
            {
              name: 'talkgroup', type: 'string',
            },
            {
              name: 'talkgroupList', type: 'string',
            },
            {
              name: 'tower', type: 'string',
            },
            {
              name: 'timestamp', type: 'bigint',
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

    // Make the glue crawler
    const glueCrawlerRole = new iam.Role(this, 'cvfd-events-glue-role', {
      assumedBy: new iam.ServicePrincipal('glue.amazonaws.com'),
      inlinePolicies: {
        all: new iam.PolicyDocument({
          statements: [ new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            resources: [ eventsS3BucketQueue.queueArn, ],
            actions: [ 'SQS:SetQueueAttributes', ],
          }), ],
        }),
      },
      managedPolicies: [ iam.ManagedPolicy.fromManagedPolicyArn(this, 'glue-managed-policy', 'arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole'), ],
    });
    new glue.CfnCrawler(this, 'cvfd-events-glue-crawler', {
      role: glueCrawlerRole.roleArn,
      targets: {
        catalogTargets: [ {
          databaseName: glueDatabaseName,
          tables: [ glueTableName, ],
          eventQueueArn: eventsS3BucketQueue.queueArn,
        }, ],
      },
      recrawlPolicy: {
        recrawlBehavior: 'CRAWL_EVENT_MODE',
      },
      schemaChangePolicy: {
        deleteBehavior: 'LOG',
        updateBehavior: 'LOG',
      },
      // schedule: {
      //   scheduleExpression: 'cron(15 */2 * * ? *)'
      // }
    });
    eventsS3BucketQueue.grantConsumeMessages(glueCrawlerRole);
    eventsS3Bucket.grantReadWrite(glueCrawlerRole);

    // Make the kinesis firehose
    const eventsFirehose = new kinesisfirehose.CfnDeliveryStream(this, 'cvfd-events-firehose', {
      deliveryStreamName: 'cvfd-events-delivery-stream',
      extendedS3DestinationConfiguration: {
        bucketArn: eventsS3Bucket.bucketArn,
        roleArn: eventsFirehoseRole.roleArn,
        bufferingHints: {
          intervalInSeconds: 300,
        },
        prefix: 'data/year=!{timestamp:yyyy}/month=!{timestamp:MM}/day=!{timestamp:dd}/hour=!{timestamp:HH}/event=!{partitionKeyFromQuery:event}/',
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
                parameterName: 'JsonParsingEngine', parameterValue: 'JQ-1.6',
              },
              {
                parameterName: 'MetadataExtractionQuery', parameterValue: '{event:.event}',
              },
            ],
          }, ],
        },
        dynamicPartitioningConfiguration: { enabled: true, },
      },
    });

    // Create the dead letter queue
    const deadLetterQueue = new sqs.Queue(this, 'cvfd-error-queue');

    // Create the SQS queue
    const queue = new sqs.Queue(this, 'cvfd-queue', {
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 2,
      },
    });

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

    // Build the lambda environment variables
    const lambdaEnv: LambdaEnvironment = {
      S3_BUCKET: bucket.bucketName,
      COSTS_BUCKET: costDataS3Bucket.bucketName,

      TWILIO_SECRET: twilioSecret.secretArn,
      JWT_SECRET: jwtSecret.secretArn,
      TESTING_USER: process.env.TESTING_USER as string,
      SQS_QUEUE: queue.queueUrl,
      FIREHOSE_NAME: eventsFirehose.deliveryStreamName as string,

      TABLE_USER: phoneNumberTable.tableName,
      TABLE_FILE: dtrTable.tableName,
      TABLE_TEXT: textsTable.tableName,
      TABLE_STATUS: statusTable.tableName,
      TABLE_TALKGROUP: talkgroupTable.tableName,
      TABLE_SITE: siteTable.tableName,
      TABLE_DTR_TRANSLATION: dtrTranslationTable.tableName,
    };

    // Create a handler that pushes file information into Dynamo DB
    const s3Handler = new lambdanodejs.NodejsFunction(this, 'cvfd-s3-lambda', {
      initialPolicy: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [ 'cloudwatch:PutMetricData', ],
          resources: [ '*', ],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [ 'transcribe:*', ],
          resources: [ '*', ],
        }),
      ],
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: resolve(resourceBase, 's3.ts'),
      handler: 'main',
      environment: {
        ...lambdaEnv,
      },
      timeout: Duration.minutes(1),
    });

    // Grant access for the S3 handler
    bucket.grantReadWrite(s3Handler);
    dtrTable.grantReadWriteData(s3Handler);
    talkgroupTable.grantReadWriteData(s3Handler);
    queue.grantSendMessages(s3Handler);
    dtrTranslationTable.grantReadWriteData(s3Handler);

    // Create a handler for the SQS queue
    const queueHandler = new lambdanodejs.NodejsFunction(this, 'cvfd-queue-lambda', {
      initialPolicy: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [ 'cloudwatch:PutMetricData', ],
          resources: [ '*', ],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [ 'transcribe:*', ],
          resources: [ '*', ],
        }),
      ],
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: resolve(resourceBase, 'queue.ts'),
      handler: 'main',
      environment: {
        ...lambdaEnv,
      },
      timeout: Duration.minutes(1),
    });
    queueHandler.addEventSource(new lambdaEventSources.SqsEventSource(queue));

    // Grant access for the queue handler
    phoneNumberTable.grantReadWriteData(queueHandler);
    textsTable.grantReadWriteData(queueHandler);
    dtrTable.grantReadWriteData(queueHandler);
    twilioSecret.grantRead(queueHandler);
    dtrTranslationTable.grantReadWriteData(queueHandler);
    siteTable.grantReadWriteData(queueHandler);

    // Create a queue for cloudwatch alarms
    const alarmQueueHandler = new lambdanodejs.NodejsFunction(this, 'cvfd-alarm-queue-lambda', {
      initialPolicy: [ new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'cloudwatch:PutMetricData',
          'cloudwatch:ListTagsForResource',
        ],
        resources: [ '*', ],
      }), ],
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: resolve(resourceBase, 'alarms.ts'),
      handler: 'main',
      timeout: Duration.seconds(30),
      environment: {
        ...lambdaEnv,
      },
    });
    textsTable.grantReadWriteData(alarmQueueHandler);
    phoneNumberTable.grantReadData(alarmQueueHandler);
    twilioSecret.grantRead(alarmQueueHandler);
    costDataS3Bucket.grantReadWrite(alarmQueueHandler);

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
    const statusHandler = new lambdanodejs.NodejsFunction(this, 'cvfd-status-lambda', {
      initialPolicy: [ new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [ 'cloudwatch:PutMetricData', ],
        resources: [ '*', ],
      }), ],
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: resolve(resourceBase, 'status.ts'),
      handler: 'main',
      environment: {
        ...lambdaEnv,
      },
      timeout: Duration.minutes(1),
    });

    // Grant access for the status handler
    statusTable.grantReadWriteData(statusHandler);
    phoneNumberTable.grantReadData(statusHandler);
    textsTable.grantReadWriteData(statusHandler);
    twilioSecret.grantRead(statusHandler);

    // Schedule the function for every minute
    const statusEventRule = new events.Rule(this, 'status-rule', {
      schedule: events.Schedule.cron({
        minute: '*',
      }),
    });
    statusEventRule.addTarget(new targets.LambdaFunction(statusHandler));

    // Create the weather updater
    const weatherUpdater = new lambdanodejs.NodejsFunction(this, 'cvfd-weather-lambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: resolve(resourceBase, 'weather.ts'),
      handler: 'main',
      environment: {
        ...lambdaEnv,
      },
      timeout: Duration.minutes(5),
    });

    // Grant access for the status handler
    bucket.grantReadWrite(weatherUpdater);

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
    };

    // Create a rest API
    const api = new apigateway.RestApi(this, 'cvfd-api-gateway', {
      restApiName: 'CVFD API Gateway',
      description: 'Allow interaction from the CVFD radio website',
    });
    const apiResource = api.root.addResource('api');

    interface ApiDefinition {
      name: string;
      read?: dynamodb.Table[];
      readWrite?: dynamodb.Table[];
      bucket?: s3.IBucket;
      queue?: sqs.Queue;
      firehose?: kinesisfirehose.CfnDeliveryStream,
      secret?: secretsManager.ISecret;
      secret2?: secretsManager.ISecret;
    }

    const cofrnApis: ApiDefinition[] = [
      {
        name: 'infra',
        read: [
          dtrTable,
          textsTable,
        ],
        readWrite: [
          phoneNumberTable,
          statusTable,
          siteTable,
          textsTable,
        ],
        bucket,
        queue,
        secret: twilioSecret,
        secret2: jwtSecret,
      },
      {
        name: 'events',
        firehose: eventsFirehose,
      },
    ];

    cofrnApis.forEach(config => {
      const apiHandler = new lambdanodejs.NodejsFunction(this, `cvfd-api-${config.name}-lambda`, {
        initialPolicy: [ new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [ 'cloudwatch:PutMetricData', ],
          resources: [ '*', ],
        }), ],
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: resolve(resourceBase, 'api', `${config.name}.ts`),
        handler: 'main',
        environment: {
          ...lambdaEnv,
        },
        timeout: Duration.seconds(10),
      });

      if (config.read) config.read.forEach(table => table.grantReadData(apiHandler));
      if (config.readWrite) config.readWrite.forEach(table => table.grantReadWriteData(apiHandler));
      if (config.bucket) config.bucket.grantRead(apiHandler);
      if (config.queue) config.queue.grantSendMessages(apiHandler);
      if (config.firehose) apiHandler.addToRolePolicy(new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: [ config.firehose.attrArn, ],
        actions: [
          'firehose:PutRecord',
          'firehose:PutRecordBatch',
        ],
      }));
      if (config.secret) config.secret.grantRead(apiHandler);
      if (config.secret2) config.secret2.grantRead(apiHandler);

      const apiIntegration = new apigateway.LambdaIntegration(apiHandler, {
        requestTemplates: {
          'application/json': '{"statusCode":"200"}',
        },
      });
      const newApiResource = apiResource.addResource(config.name);
      newApiResource.addMethod('GET', apiIntegration);
      newApiResource.addMethod('POST', apiIntegration);
      const envName = newApiResource.path
        .replace(/[\{\}]/g, '')
        .replace(/\//, '')
        .replace(/\//g, '_')
        .toUpperCase();
      lambdaNames[`A_${envName}`] = apiHandler.functionName;
    });

    // Maps for tables and buckets for the v2 APIs
    const tableMap = {
      FILE: dtrTable,
      USER: phoneNumberTable,
      TEXT: textsTable,
      SITE: siteTable,
      TALKGROUP: talkgroupTable,
      STATUS: statusTable,
    } as const;
    const bucketMap = {
      FILE: bucket,
      COSTS: costDataS3Bucket,
    } as const;

    // Add the v2 APIs
    const apiV2 = apiResource.addResource('v2');
    interface V2ApiConfigBase {
      pathPart: string;
      next?: V2ApiConfig[];
    }
    interface V2ApiConfigHandler extends V2ApiConfigBase {
      fileName: string;
      methods: (keyof typeof HTTPMethod)[];
      authRequired?: true;
      sqsQueue?: true;
      twilioSecret?: true;
      sendsMetrics?: true;
      getMetrics?: true;
      getCosts?: true;
      tables?: {
        table: keyof typeof tableMap;
        readOnly?: true;
      }[];
      buckets?: {
        bucket: keyof typeof bucketMap;
        readOnly?: true;
      }[];
    }
    type V2ApiConfig = V2ApiConfigBase | V2ApiConfigHandler;
    const v2Apis: V2ApiConfig[] = [
      {
        pathPart: 'metrics',
        fileName: 'metrics',
        methods: [ 'POST', ],
        getMetrics: true,
      },
      {
        pathPart: 'files',
        fileName: 'files',
        methods: [ 'GET', ],
        tables: [ {
          table: 'FILE',
          readOnly: true,
        }, ],
        next: [ {
          pathPart: '{id}',
          fileName: 'file',
          methods: [ 'GET', ],
          tables: [ {
            table: 'FILE',
            readOnly: true,
          }, ],
        }, ],
      },
      {
        pathPart: 'talkgroups',
        fileName: 'talkgroups',
        methods: [ 'GET', ],
        tables: [ {
          table: 'TALKGROUP',
          readOnly: true,
        }, ],
        next: [ {
          pathPart: '{id}',
          fileName: 'talkgroup',
          methods: [
            'GET',
            'PATCH',
          ],
          authRequired: true,
          tables: [ {
            table: 'TALKGROUP',
          }, ],
        }, ],
      },
      {
        pathPart: 'users',
        fileName: 'users',
        methods: [
          'GET',
          'POST',
        ],
        authRequired: true,
        sqsQueue: true,
        tables: [ {
          table: 'USER',
        }, ],
        next: [ {
          pathPart: '{id}',
          fileName: 'user',
          methods: [
            'GET',
            'PATCH',
            'DELETE',
          ],
          authRequired: true,
          sqsQueue: true,
          tables: [ {
            table: 'USER',
          }, ],
          next: [ {
            pathPart: '{department}',
            fileName: 'userDepartment',
            methods: [
              'POST',
              'PATCH',
              'DELETE',
            ],
            authRequired: true,
            sqsQueue: true,
            tables: [ {
              table: 'USER',
            }, ],
          }, ],
        }, ],
      },
      {
        pathPart: 'texts',
        fileName: 'texts',
        methods: [ 'GET', ],
        authRequired: true,
        tables: [ {
          table: 'TEXT',
          readOnly: true,
        }, ],
        next: [ {
          pathPart: '{id}',
          fileName: 'text',
          methods: [ 'PATCH', ],
          tables: [ {
            table: 'TEXT',
          }, ],
        }, ],
      },
      {
        pathPart: 'twilio',
        fileName: 'twilioBase',
        methods: [ 'POST', ],
        twilioSecret: true,
        sqsQueue: true,
        tables: [ {
          table: 'USER',
        }, ],
        next: [ {
          pathPart: '{id}',
          fileName: 'twilioStatus',
          methods: [ 'POST', ],
          sqsQueue: true,
          twilioSecret: true,
          sendsMetrics: true,
          tables: [
            {
              table: 'TEXT',
            },
            {
              table: 'USER',
            },
          ],
        }, ],
      },
      {
        pathPart: 'login',
        next: [ {
          pathPart: '{id}',
          fileName: 'login',
          methods: [
            'GET',
            'POST',
          ],
          authRequired: true,
          sqsQueue: true,
          tables: [ {
            table: 'USER',
          }, ],
        }, ],
      },
      {
        pathPart: 'logout',
        fileName: 'logout',
        methods: [ 'GET', ],
      },
      {
        pathPart: 'sites',
        fileName: 'sites',
        methods: [ 'GET', ],
        authRequired: true,
        tables: [ {
          table: 'SITE',
        }, ],
      },
      {
        pathPart: 'heartbeats',
        fileName: 'heartbeats',
        methods: [ 'GET', ],
        authRequired: true,
        tables: [ {
          table: 'STATUS',
          readOnly: true,
        }, ],
      },
      {
        pathPart: 'departments',
        next: [ {
          pathPart: '{id}',
          fileName: 'department',
          methods: [ 'GET', ],
          buckets: [ {
            bucket: 'COSTS',
          }, ],
          getCosts: true,
          authRequired: true,
          twilioSecret: true,
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
        const initialPolicy: iam.PolicyStatement[] = [];
        if (config.sendsMetrics) {
          initialPolicy.push(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [ 'cloudwatch:PutMetricData', ],
            resources: [ '*', ],
          }));
        }
        if (config.getMetrics) {
          initialPolicy.push(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [ 'cloudwatch:*', ],
            resources: [ '*', ],
          }));
        }

        resourceHandler = new lambdanodejs.NodejsFunction(this, `cofrn-api-v2-${config.fileName}`, {
          runtime: lambda.Runtime.NODEJS_20_X,
          entry: resolve(resourceBase, 'api', 'v2', `${config.fileName}.ts`),
          handler: 'main',
          timeout: Duration.seconds(10),
          initialPolicy,
          environment: {
            ...lambdaEnv,
          },
        });
        resourceIntegration = new apigateway.LambdaIntegration(resourceHandler, {
          requestTemplates: {
            'application/json': '{"statusCode":"200"}',
          },
        });
        if (config.getMetrics) {
          lambdaNameRecips.push(resourceHandler);
        }

        // Add read ability to the users table if the API will need authentication
        if (
          config.authRequired &&
          !config.tables?.some(v => v.table === 'USER')
        ) {
          config.tables = config.tables || [];
          config.tables.push({
            table: 'USER',
            readOnly: true,
          });
        }

        // Add access to the JWT secret
        if (config.authRequired) {
          jwtSecret.grantRead(resourceHandler);
        }

        // Add the table permissions
        config.tables?.forEach(table => {
          if (!resourceHandler) return;
          if (table.readOnly) {
            tableMap[table.table].grantReadData(resourceHandler);
          } else {
            tableMap[table.table].grantReadWriteData(resourceHandler);
          }
        });

        // Add the bucket permissions
        config.buckets?.forEach(bucket => {
          if (!resourceHandler) return;
          if (bucket.readOnly) {
            bucketMap[bucket.bucket].grantRead(resourceHandler);
          } else {
            bucketMap[bucket.bucket].grantReadWrite(resourceHandler);
          }
        });

        // Grant access to the SQS queue if needed
        if (config.sqsQueue) {
          queue.grantSendMessages(resourceHandler);
        }

        // Grant access to the Twilio secret if needed
        if (config.twilioSecret) {
          twilioSecret.grantRead(resourceHandler);
        }

        // Grant access to the billing information if needed
        if (config.getCosts) {
          resourceHandler.addToRolePolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            resources: [ '*', ],
            actions: [ 'ce:GetCostAndUsage', ],
          }));
        }
      }

      // Add the resource
      const apiResource = baseResource.addResource(config.pathPart);
      if ('fileName' in config && resourceIntegration) config.methods.forEach(method => apiResource.addMethod(method, resourceIntegration));
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
    s3ReadPolicy.addCanonicalUserPrincipal(s3AccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId);

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
      defaultBehavior: {
        origin: cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(reactBucket),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [ {
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          function: redirectCfFunction,
        }, ],
      },
      additionalBehaviors: {
        '/weather.json': {
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED_FOR_UNCOMPRESSED_OBJECTS,
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
    // Export the CF url
    new CfnOutput(this, 'cf-url', {
      value: cfDistro.domainName,
    });
    new s3Deploy.BucketDeployment(this, 'deploy-website', {
      sources: [ s3Deploy.Source.asset(
        resolve(
          __dirname,
          '..', // stack
          '..', // src
          '..', // root
          'build'
        )
      ), ],
      destinationBucket: reactBucket,
      distribution: cfDistro,
    });

    // Add the alarms
    const baseTowerAlarmConfig: cloudwatch.AlarmProps = {
      evaluationPeriods: 6,
      datapointsToAlarm: 5,
      metric: new cloudwatch.Metric({
        metricName: 'Decode Rate',
        namespace: 'DTR Metrics',
        period: Duration.minutes(5),
        statistic: cloudwatch.Stats.MINIMUM,
        dimensionsMap: {
          Tower: 'Saguache',
        },
      }),
      threshold: 30,
      alarmDescription: 'Recording audio from the Saguache Tower may not be occurring on may only be occurring intermitently',
      alarmName: 'Saguache Tower Decode Rate',
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    };
    const baseUploadAlarmConfig: cloudwatch.AlarmProps = {
      evaluationPeriods: 18,
      datapointsToAlarm: 18,
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
      alarmDescription: 'No files have been uploaded for Saguache Tower in the past 18 hours which may indicate the tower is not being recorded',
      alarmName: 'Saguache Tower Uploads',
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    };
    const alarms: CvfdAlarm[] = [
      { // Saguache tower not decoding
        tag: 'Dtr',
        codeName: 'saguache-tower',
        alarm: {
          ...baseTowerAlarmConfig,
        },
      },
      { // Saguache tower down
        tag: 'Dtr',
        codeName: 'saguache-tower-upload',
        alarm: {
          ...baseUploadAlarmConfig,
          evaluationPeriods: 18,
          datapointsToAlarm: 18,
        },
      },
      { // Pool table tower down
        tag: 'Dtr',
        codeName: 'pool-table-upload',
        alarm: {
          ...baseUploadAlarmConfig,
          evaluationPeriods: 4,
          datapointsToAlarm: 4,
          metric: new cloudwatch.Metric({
            metricName: 'UploadTime',
            namespace: 'DTR Metrics',
            period: Duration.hours(3),
            statistic: cloudwatch.Stats.SAMPLE_COUNT,
            dimensionsMap: {
              Tower: 'PoolTable',
            },
          }),
          alarmDescription: 'No files have been uploaded for Pool Table Tower in the past 12 hours which may indicate the tower is not being recorded',
          alarmName: 'Pool Table Uploads',
        },
      },

      /*
       * { // API 4XX errors
       *   tag: 'Api',
       *   codeName: 'api4xx',
       *   okayAction: false,
       *   alarm: {
       *     evaluationPeriods: 1,
       *     datapointsToAlarm: 1,
       *     threshold: 0,
       *     alarmDescription: 'COFRN API is giving 4XX responses',
       *     alarmName: 'COFRN API 4XX',
       *     comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
       *     treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
       *     metric: new cloudwatch.Metric({
       *       metricName: '4XXError',
       *       namespace: 'AWS/ApiGateway',
       *       period: Duration.minutes(15),
       *       statistic: cloudwatch.Stats.SUM,
       *       dimensionsMap: {
       *         ApiName: api.restApiName,
       *       },
       *     }),
       *   },
       * },
       */
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
    ];

    alarms.forEach(alarmConfig => {
      const alarm = new cloudwatch.Alarm(this, `cvfd-alarm-${alarmConfig.codeName}`, alarmConfig.alarm);
      alarm.addAlarmAction(alarmAction);
      if (alarmConfig.okayAction !== false) alarm.addOkAction(alarmAction);

      Tags.of(alarm).add('cofrn-alarm-type', alarmConfig.tag);
    });
  }
}
