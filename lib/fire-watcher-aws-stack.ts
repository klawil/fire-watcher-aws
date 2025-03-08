import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdanodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3Notifications from 'aws-cdk-lib/aws-s3-notifications';
import * as secretsManager from 'aws-cdk-lib/aws-secretsmanager';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cw_actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as subscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as eventbridge from 'aws-cdk-lib/aws-events';
import * as eventtarget from 'aws-cdk-lib/aws-events-targets';
import * as glue from 'aws-cdk-lib/aws-glue';
import * as kinesisfirehose from 'aws-cdk-lib/aws-kinesisfirehose';

const bucketName = '***REMOVED***';
const certArn = '***REMOVED***';
const secretArn = '***REMOVED***';

interface CvfdAlarm {
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
        type: dynamodb.AttributeType.NUMBER
      }
    });
    const dtrTable = new dynamodb.Table(this, 'cvfd-dtr-added', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'Talkgroup',
        type: dynamodb.AttributeType.NUMBER
      },
      sortKey: {
        name: 'Added',
        type: dynamodb.AttributeType.NUMBER
      }
    });
    const textsTable = new dynamodb.Table(this, 'cvfd-messages', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'datetime',
        type: dynamodb.AttributeType.NUMBER
      }
    });
    const statusTable = new dynamodb.Table(this, 'cvfd-status', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'ServerProgram',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'Program',
        type: dynamodb.AttributeType.STRING
      }
    });
    const talkgroupTable = new dynamodb.Table(this, 'cvfd-talkgroups', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'ID',
        type: dynamodb.AttributeType.NUMBER
      }
    });
    const siteTable = new dynamodb.Table(this, 'cvfd-sites', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'SiteId',
        type: dynamodb.AttributeType.STRING
      }
    });

    // Make the S3 bucket for the kinesis stuff
    const eventsS3Bucket = new s3.Bucket(this, 'cvfd-events-bucket');
    const eventsS3BucketQueue = new sqs.Queue(this, 'cvfd-events-queue');
    const eventsS3BucketQueueDestination = new s3Notifications.SqsDestination(eventsS3BucketQueue);
    eventsS3Bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      eventsS3BucketQueueDestination,
      { prefix: 'data/' }
    );
    eventsS3Bucket.addEventNotification(
      s3.EventType.OBJECT_REMOVED,
      eventsS3BucketQueueDestination,
      { prefix: 'data/' }
    );

    // Make the Glue table
    const glueCatalogId = '***REMOVED***'; // Account ID
    const glueDatabaseName = 'cvfd-data-db';
    const glueTableName = 'cvfd-radio-events';
    const eventsGlueDatabase = new glue.CfnDatabase(this, 'cvfd-glue-database', {
      catalogId: glueCatalogId,
      databaseInput: {
        name: glueDatabaseName
      }
    });
    const eventsGlueTable = new glue.CfnTable(this, 'cvfd-events-table', {
      databaseName: glueDatabaseName,
      catalogId: glueCatalogId,
      tableInput: {
        name: glueTableName,
        tableType: 'EXTERNAL_TABLE',
        partitionKeys: [
          { name: 'year', type: 'int' },
          { name: 'month', type: 'int' },
          { name: 'day', type: 'int' },
          { name: 'hour', type: 'int' },
          { name: 'event', type: 'string' },
        ],
        storageDescriptor: {
          compressed: true,
          inputFormat: 'org.apache.hadoop.hive.ql.io.orc.OrcInputFormat',
          outputFormat: 'org.apache.hadoop.hive.ql.io.orc.OrcOutputFormat',
          serdeInfo: {
            serializationLibrary: 'org.apache.hadoop.hive.ql.io.orc.OrcSerde'
          },
          columns: [
            { name: 'radioId', type: 'string' },
            { name: 'talkgroup', type: 'string' },
            { name: 'talkgroupList', type: 'string' },
            { name: 'tower', type: 'string' },
            { name: 'timestamp', type: 'bigint' },
          ],
          location: eventsS3Bucket.s3UrlForObject() + '/data/'
        }
      }
    });
    eventsGlueTable.addDependency(eventsGlueDatabase);

    // Make the role
    const eventsFirehoseRole = new iam.Role(this, 'cvfd-events-firehose-role', {
      assumedBy: new iam.ServicePrincipal('firehose.amazonaws.com')
    });
    eventsS3Bucket.grantReadWrite(eventsFirehoseRole);
    eventsFirehoseRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: [
        `arn:aws:glue:us-east-2:${glueCatalogId}:table/*`,
        `arn:aws:glue:us-east-2:${glueCatalogId}:database/*`,
        `arn:aws:glue:us-east-2:${glueCatalogId}:catalog`,
      ],
      actions: [
        'glue:GetDatabase',
        'glue:GetTable',
        'glue:GetPartition*',
        'glue:GetTableVersions',
      ]
    }));
    eventsFirehoseRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: [ '*' ],
      actions: [
        'glue:GetDatabase',
        'glue:GetTable',
        'glue:GetPartition*',
        'glue:GetTableVersions',
      ]
    }));
    eventsFirehoseRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: [ '*' ],
      actions: [ 'logs:CreateLogGroup', 'logs:PutLogEvents', 'logs:CreateLogStream' ]
    }));

    // Make the glue crawler
    const glueCrawlerRole = new iam.Role(this, 'cvfd-events-glue-role', {
      assumedBy: new iam.ServicePrincipal('glue.amazonaws.com'),
      inlinePolicies: {
        all: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              resources: [ eventsS3BucketQueue.queueArn ],
              actions: [ 'SQS:SetQueueAttributes' ]
            }),
          ]
        })
      },
      managedPolicies: [
        iam.ManagedPolicy.fromManagedPolicyArn(this, 'glue-managed-policy', 'arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole')
      ]
    });
    new glue.CfnCrawler(this, 'cvfd-events-glue-crawler', {
      role: glueCrawlerRole.roleArn,
      targets: {
        catalogTargets: [{
          databaseName: glueDatabaseName,
          tables: [ glueTableName ],
          eventQueueArn: eventsS3BucketQueue.queueArn
        }],
      },
      recrawlPolicy: {
        recrawlBehavior: 'CRAWL_EVENT_MODE'
      },
      schemaChangePolicy: {
        deleteBehavior: 'LOG',
        updateBehavior: 'LOG'
      },
      schedule: {
        scheduleExpression: 'cron(15 */2 * * ? *)'
      }
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
            deserializer: { openXJsonSerDe: { } }
          },
          outputFormatConfiguration: {
            serializer: { orcSerDe: { } }
          },
          schemaConfiguration: {
            catalogId: eventsGlueTable.catalogId,
            roleArn: eventsFirehoseRole.roleArn,
            databaseName: eventsGlueTable.databaseName,
            tableName: glueTableName
          }
        },
        processingConfiguration: {
          enabled: true,
          processors: [{
            type: 'MetadataExtraction',
            parameters: [
              { parameterName: 'JsonParsingEngine', parameterValue: 'JQ-1.6' },
              { parameterName: 'MetadataExtractionQuery', parameterValue: '{event:.event}' },
            ]
          }]
        },
        dynamicPartitioningConfiguration: { enabled: true }
      }
    });

    phoneNumberTable.addGlobalSecondaryIndex({
      indexName: 'StationIndex',
      partitionKey: {
        name: 'department',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'callSign',
        type: dynamodb.AttributeType.NUMBER
      }
    });

    dtrTable.addGlobalSecondaryIndex({
      indexName: 'AddedIndex',
      partitionKey: {
        name: 'Emergency',
        type: dynamodb.AttributeType.NUMBER
      },
      sortKey: {
        name: 'Added',
        type: dynamodb.AttributeType.NUMBER
      }
    });
    dtrTable.addGlobalSecondaryIndex({
      indexName: 'StartTimeTgIndex',
      partitionKey: {
        name: 'Talkgroup',
        type: dynamodb.AttributeType.NUMBER
      },
      sortKey: {
        name: 'StartTime',
        type: dynamodb.AttributeType.NUMBER
      }
    });
    dtrTable.addGlobalSecondaryIndex({
      indexName: 'StartTimeEmergIndex',
      partitionKey: {
        name: 'Emergency',
        type: dynamodb.AttributeType.NUMBER
      },
      sortKey: {
        name: 'StartTime',
        type: dynamodb.AttributeType.NUMBER
      }
    });
    dtrTable.addGlobalSecondaryIndex({
      indexName: 'KeyIndex',
      partitionKey: {
        name: 'Key',
        type: dynamodb.AttributeType.STRING
      }
    });
    dtrTable.addGlobalSecondaryIndex({
      indexName: 'ToneIndex',
      partitionKey: {
        name: 'ToneIndex',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'StartTime',
        type: dynamodb.AttributeType.NUMBER
      }
    });

    talkgroupTable.addGlobalSecondaryIndex({
      indexName: 'InUseIndex',
      partitionKey: {
        name: 'InUse',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'Count',
        type: dynamodb.AttributeType.NUMBER
      }
    });

    textsTable.addGlobalSecondaryIndex({
      indexName: 'isTestIndex',
      partitionKey: {
        name: 'isTestString',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'datetime',
        type: dynamodb.AttributeType.NUMBER
      }
    });
    textsTable.addGlobalSecondaryIndex({
      indexName: 'pageIndex',
      partitionKey: {
        name: 'isPage',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'datetime',
        type: dynamodb.AttributeType.NUMBER
      }
    });

    siteTable.addGlobalSecondaryIndex({
      indexName: 'active',
      partitionKey: {
        name: 'IsActive',
        type: dynamodb.AttributeType.STRING
      }
    });

    // Create the dead letter queue
    const deadLetterQueue = new sqs.Queue(this, 'cvfd-error-queue');

    // Create the SQS queue
    const queue = new sqs.Queue(this, 'cvfd-queue', {
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: 2
      }
    });

    // Create a handler that pushes file information into Dynamo DB
    const s3Handler = new lambdanodejs.NodejsFunction(this, 'cvfd-s3-lambda', {
      initialPolicy: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [ 'cloudwatch:PutMetricData' ],
          resources: [ '*' ]
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [ 'transcribe:*' ],
          resources: [ '*' ]
        })
      ],
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: __dirname + '/../resources/s3.ts',
      handler: 'main',
      environment: {
        TABLE_DTR: dtrTable.tableName,
        TABLE_TALKGROUP: talkgroupTable.tableName,
        SQS_QUEUE: queue.queueUrl
      }
    });
    
    // Grant access for the S3 handler
    bucket.grantRead(s3Handler);
    dtrTable.grantReadWriteData(s3Handler);
    talkgroupTable.grantReadWriteData(s3Handler);
    queue.grantSendMessages(s3Handler);

    // Create a handler for the SQS queue
    const queueHandler = new lambdanodejs.NodejsFunction(this, 'cvfd-queue-lambda', {
      initialPolicy: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [ 'cloudwatch:PutMetricData' ],
          resources: [ '*' ]
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [ 'transcribe:*' ],
          resources: [ '*' ]
        })
      ],
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: __dirname + '/../resources/queue.ts',
      handler: 'main',
      environment: {
        TABLE_PHONE: phoneNumberTable.tableName,
        TABLE_MESSAGES: textsTable.tableName,
        TABLE_DTR: dtrTable.tableName,
        TWILIO_SECRET: secretArn
      },
      timeout: Duration.minutes(1)
    });
    queueHandler.addEventSource(new lambdaEventSources.SqsEventSource(queue));

    // Grant access for the queue handler
    phoneNumberTable.grantReadWriteData(queueHandler);
    textsTable.grantReadWriteData(queueHandler);
    dtrTable.grantReadData(queueHandler);
    twilioSecret.grantRead(queueHandler);

    // Create a queue for cloudwatch alarms
    const alarmQueue = new sqs.Queue(this, 'cvfd-alarm-queue');
    const alarmQueueHandler = new lambdanodejs.NodejsFunction(this, 'cvfd-alarm-queue-lambda', {
      initialPolicy: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [ 'cloudwatch:PutMetricData' ],
          resources: [ '*' ]
        })
      ],
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: __dirname + '/../resources/alarms.ts',
      handler: 'main',
      timeout: Duration.seconds(30),
      environment: {
        TWILIO_SECRET: secretArn,
        TABLE_PHONE: phoneNumberTable.tableName,
        TABLE_MESSAGES: textsTable.tableName
      }
    });
    alarmQueueHandler.addEventSource(new lambdaEventSources.SqsEventSource(alarmQueue));
    textsTable.grantReadWriteData(alarmQueueHandler);
    phoneNumberTable.grantReadData(alarmQueueHandler);
    twilioSecret.grantRead(alarmQueueHandler);

    const alarmTopic = new sns.Topic(this, 'cvfd-alarm-topic');
    alarmTopic.addSubscription(new subscriptions.SqsSubscription(alarmQueue));
    const alarmAction = new cw_actions.SnsAction(alarmTopic);

    const baseTowerAlarmConfig: cloudwatch.AlarmProps = {
      evaluationPeriods: 5,
      datapointsToAlarm: 5,
      metric: new cloudwatch.Metric({
        metricName: 'Decode Rate',
        namespace: 'DTR Metrics',
        period: Duration.minutes(2),
        statistic: cloudwatch.Stats.MINIMUM,
        dimensionsMap: {
          Tower: 'Saguache'
        }
      }),
      threshold: 35,
      alarmDescription: 'Saguache Tower Decode Rate below 35/min',
      alarmName: 'Saguache Tower',
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING
    };
    const baseApiAlarmConfig: cloudwatch.AlarmProps = {
      evaluationPeriods: 1,
      datapointsToAlarm: 1,
      metric: new cloudwatch.Metric({
        metricName: 'Error',
        namespace: 'CVFD API',
        period: Duration.hours(1),
        statistic: cloudwatch.Stats.SUM,
        dimensionsMap: {
          source: 'User'
        }
      }),
      threshold: 0,
      alarmDescription: 'User API Error Occured',
      alarmName: 'User API Error',
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    };
    const baseUploadAlarmConfig: cloudwatch.AlarmProps = {
      evaluationPeriods: 24,
      datapointsToAlarm: 24,
      metric: new cloudwatch.Metric({
        metricName: 'Upload',
        namespace: 'DTR Metrics',
        period: Duration.hours(1),
        statistic: cloudwatch.Stats.SUM,
        dimensionsMap: {
          Tower: 'Saguache'
        }
      }),
      threshold: 0,
      alarmDescription: 'No files uploaded for Saguache Tower',
      alarmName: 'Saguache Tower Uploads',
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING
    };
    const alarms: CvfdAlarm[] = [
      {
        codeName: 'saguache-tower',
        alarm: {
          ...baseTowerAlarmConfig
        }
      },
      {
        codeName: 'pooltable-tower',
        alarm: {
          ...baseTowerAlarmConfig,
          evaluationPeriods: 15,
          datapointsToAlarm: 15,
          metric: new cloudwatch.Metric({
            metricName: 'Decode Rate',
            namespace: 'DTR Metrics',
            period: Duration.minutes(2),
            statistic: cloudwatch.Stats.MINIMUM,
            dimensionsMap: {
              Tower: 'PoolTable'
            }
          }),
          alarmDescription: 'Pool Table Decode Rate below 35/min',
          alarmName: 'Pool Table Tower'
        }
      },
      {
        codeName: 'saguache-tower-upload',
        alarm: {
          ...baseUploadAlarmConfig
        }
      },
      {
        codeName: 'pool-table-upload',
        alarm: {
          ...baseUploadAlarmConfig,
          metric: new cloudwatch.Metric({
            metricName: 'Upload',
            namespace: 'DTR Metrics',
            period: Duration.hours(1),
            statistic: cloudwatch.Stats.SUM,
            dimensionsMap: {
              Tower: 'PoolTable'
            }
          }),
          alarmDescription: 'No files uploaded for Pool Table',
          alarmName: 'Pool Table Uploads',
        }
      },
      {
        codeName: 'san-antonio-upload',
        alarm: {
          ...baseUploadAlarmConfig,
          metric: new cloudwatch.Metric({
            metricName: 'Upload',
            namespace: 'DTR Metrics',
            period: Duration.hours(1),
            statistic: cloudwatch.Stats.SUM,
            dimensionsMap: {
              Tower: 'SanAntonio'
            }
          }),
          alarmDescription: 'No files uploaded for San Antonio Peak',
          alarmName: 'San Antonio Peak Uploads',
        }
      },
      {
        codeName: 'user-api',
        okayAction: false,
        alarm: {
          ...baseApiAlarmConfig
        }
      },
      {
        codeName: 'twilio-api',
        okayAction: false,
        alarm: {
          ...baseApiAlarmConfig,
          metric: new cloudwatch.Metric({
            metricName: 'Error',
            namespace: 'CVFD API',
            period: Duration.minutes(1),
            statistic: cloudwatch.Stats.SUM,
            dimensionsMap: {
              source: 'Twilio'
            }
          }),
          alarmDescription: 'Twilio API error occured',
          alarmName: 'Twilio API Error'
        }
      },
      {
        codeName: 'infra-api',
        okayAction: false,
        alarm: {
          ...baseApiAlarmConfig,
          metric: new cloudwatch.Metric({
            metricName: 'Error',
            namespace: 'CVFD API',
            period: Duration.minutes(30),
            statistic: cloudwatch.Stats.SUM,
            dimensionsMap: {
              source: 'Infra'
            }
          }),
          alarmDescription: 'Infra API error occured',
          alarmName: 'Infra API Error'
        }
      },
      {
        codeName: 'frontend-api',
        okayAction: false,
        alarm: {
          ...baseApiAlarmConfig,
          metric: new cloudwatch.Metric({
            metricName: 'Error',
            namespace: 'CVFD API',
            period: Duration.minutes(30),
            statistic: cloudwatch.Stats.SUM,
            dimensionsMap: {
              source: 'Frontend'
            }
          }),
          alarmDescription: 'Frontend API error occured',
          alarmName: 'Frontend API Error'
        }
      },
      {
        codeName: 's3-api',
        okayAction: false,
        alarm: {
          ...baseApiAlarmConfig,
          metric: new cloudwatch.Metric({
            metricName: 'Error',
            namespace: 'CVFD API',
            period: Duration.minutes(1),
            statistic: cloudwatch.Stats.SUM,
            dimensionsMap: {
              source: 'S3'
            }
          }),
          alarmDescription: 'S3 API error occured',
          alarmName: 'S3 API Error'
        }
      },
      {
        codeName: 'queue-api',
        okayAction: false,
        alarm: {
          ...baseApiAlarmConfig,
          metric: new cloudwatch.Metric({
            metricName: 'Error',
            namespace: 'CVFD API',
            period: Duration.minutes(1),
            statistic: cloudwatch.Stats.SUM,
            dimensionsMap: {
              source: 'Queue'
            }
          }),
          alarmDescription: 'Queue API error occured',
          alarmName: 'Queue API Error'
        }
      },
    ];

    alarms.forEach(alarmConfig => {
      const alarm = new cloudwatch.Alarm(this, `cvfd-alarm-${alarmConfig.codeName}`, alarmConfig.alarm)
      alarm.addAlarmAction(alarmAction);
      if (alarmConfig.okayAction !== false)
        alarm.addOkAction(alarmAction);
    });

    // Create the event trigger
    const s3Destination = new s3Notifications.LambdaDestination(s3Handler);
    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      s3Destination,
      {
        prefix: 'audio/'
      }
    );
    bucket.addEventNotification(
      s3.EventType.OBJECT_REMOVED,
      s3Destination,
      {
        prefix: 'audio/'
      }
    );

    // Create the EventBridge link between the transcribe service and queue
    const rule = new eventbridge.Rule(this, 'cvfd-event-rule', {
      eventPattern: {
        source: [ 'aws.transcribe' ],
        detail: {
          TranscriptionJobStatus: [ 'COMPLETED' ]
        }
      }
    });
    rule.addTarget(new eventtarget.SqsQueue(queue))

    // Create the status parser function
    const statusHandler = new lambdanodejs.NodejsFunction(this, 'cvfd-status-lambda', {
      initialPolicy: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [ 'cloudwatch:PutMetricData' ],
          resources: [ '*' ]
        })
      ],
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: __dirname + '/../resources/status.ts',
      handler: 'main',
      environment: {
        TABLE_STATUS: statusTable.tableName,
        TABLE_PHONE: phoneNumberTable.tableName,
        TWILIO_SECRET: secretArn,
        TABLE_MESSAGES: textsTable.tableName
      },
      timeout: Duration.minutes(1)
    });

    // Grant access for the status handler
    statusTable.grantReadWriteData(statusHandler);
    phoneNumberTable.grantReadData(statusHandler);
    textsTable.grantReadWriteData(statusHandler);
    twilioSecret.grantRead(statusHandler);

    // Schedule the function for every minute
    const statusEventRule = new events.Rule(this, 'status-rule', {
      schedule: events.Schedule.cron({
        minute: '*'
      })
    });
    statusEventRule.addTarget(new targets.LambdaFunction(statusHandler));

    // Create the weather updater
    const weatherUpdater = new lambdanodejs.NodejsFunction(this, 'cvfd-weather-lambda', {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: __dirname + '/../resources/weather.ts',
      handler: 'main',
      environment: {
        S3_BUCKET: bucket.bucketName
      },
      timeout: Duration.minutes(1)
    });

    // Grant access for the status handler
    bucket.grantReadWrite(weatherUpdater);

    // Schedule the function for every 15 minutes
    const weatherEventRule = new events.Rule(this, '-rule', {
      schedule: events.Schedule.cron({
        minute: '*'
      })
    });
    weatherEventRule.addTarget(new targets.LambdaFunction(weatherUpdater));

    // Create a rest API
    const api = new apigateway.RestApi(this, 'cvfd-api-gateway', {
      restApiName: 'CVFD API Gateway',
      description: 'Allow interaction from the CVFD radio website'
    });
    const apiResource = api.root.addResource('api');

    interface ApiDefinition {
      name: string;
      env: {
        [key: string]: string;
      }
      read?: dynamodb.Table[];
      readWrite?: dynamodb.Table[];
      bucket?: s3.IBucket;
      queue?: sqs.Queue;
      firehose?: kinesisfirehose.CfnDeliveryStream,
      secret?: secretsManager.ISecret;
      metrics?: boolean;
    }

    const cvfdApis: ApiDefinition[] = [
      {
        name: 'frontend',
        env: {
          TABLE_DTR: dtrTable.tableName,
          TABLE_TALKGROUP: talkgroupTable.tableName,
          TABLE_TEXTS: textsTable.tableName,
          TABLE_USER: phoneNumberTable.tableName,
          TABLE_SITE: siteTable.tableName
        },
        read: [
          dtrTable,
          talkgroupTable,
          phoneNumberTable,
          siteTable
        ],
        readWrite: [
          textsTable
        ],
        metrics: true
      },
      {
        name: 'infra',
        env: {
          S3_BUCKET: bucket.bucketName,
          SQS_QUEUE: queue.queueUrl,
          TWILIO_SECRET: secretArn,
          TABLE_DTR: dtrTable.tableName,
          TABLE_PHONE: phoneNumberTable.tableName,
          TABLE_TEXT: textsTable.tableName,
          TABLE_STATUS: statusTable.tableName,
          TABLE_SITE: siteTable.tableName,
          TABLE_MESSAGES: textsTable.tableName
        },
        read: [
          dtrTable,
          textsTable
        ],
        readWrite: [
          phoneNumberTable,
          statusTable,
          siteTable,
          textsTable
        ],
        bucket,
        queue,
        secret: twilioSecret
      },
      {
        name: 'user',
        env: {
          QUEUE_URL: queue.queueUrl,
          TABLE_USER: phoneNumberTable.tableName
        },
        readWrite: [
          phoneNumberTable
        ],
        queue
      },
      {
        name: 'twilio',
        env: {
          SQS_QUEUE: queue.queueUrl,
          TWILIO_SECRET: secretArn,
          TABLE_PHONE: phoneNumberTable.tableName,
          TABLE_MESSAGES: textsTable.tableName
        },
        readWrite: [
          phoneNumberTable,
          textsTable
        ],
        queue,
        secret: twilioSecret
      },
      {
        name: 'events',
        env: {
          FIREHOSE_NAME: eventsFirehose.deliveryStreamName as string,
        },
        firehose: eventsFirehose
      },
    ];

    cvfdApis.forEach(config => {
      const apiHandler = new lambdanodejs.NodejsFunction(this, `cvfd-api-${config.name}-lambda`, {
        initialPolicy: [
          new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [ config.metrics ? 'cloudwatch:*' : 'cloudwatch:PutMetricData' ],
            resources: [ '*' ]
          })
        ],
        runtime: lambda.Runtime.NODEJS_18_X,
        entry: __dirname + `/../resources/api/${config.name}.ts`,
        handler: 'main',
        environment: Object.keys(config.env)
          .reduce((agg: { [key: string]: string }, key) => {
            agg[key] = config.env[key];
            return agg;
          }, {}),
        timeout: Duration.seconds(10)
      });

      if (config.read)
        config.read.forEach(table => table.grantReadData(apiHandler));
      if (config.readWrite)
        config.readWrite.forEach(table => table.grantReadWriteData(apiHandler));
      if (config.bucket)
        config.bucket.grantRead(apiHandler);
      if (config.queue)
        config.queue.grantSendMessages(apiHandler);
      if (config.firehose)
        apiHandler.addToRolePolicy(new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          resources: [ config.firehose.attrArn ],
          actions: [
            'firehose:PutRecord',
            'firehose:PutRecordBatch',
          ]
        }));
      if (config.secret)
        config.secret.grantRead(apiHandler);
    
      const apiIntegration = new apigateway.LambdaIntegration(apiHandler, {
        requestTemplates: {
          'application/json': '{"statusCode":"200"}'
        }
      });
      const newApiResource = apiResource.addResource(config.name);
      newApiResource.addMethod('GET', apiIntegration);
      newApiResource.addMethod('POST', apiIntegration);
    });

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
        bucket
      }).document.addStatements(s3ReadPolicy);
    } else {
      bucket.policy.document.addStatements(s3ReadPolicy);
    }

    // Create the cloudfront distribution
    new cloudfront.CloudFrontWebDistribution(this, 'cvfd-cloudfront', {
      viewerCertificate: {
        aliases: [ 'fire.klawil.net' ],
        props: {
          acmCertificateArn: certArn,
          sslSupportMethod: 'sni-only'
        }
      },
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: bucket,
            originAccessIdentity: s3AccessIdentity
          },
          behaviors: [{
            isDefaultBehavior: true,
            defaultTtl: Duration.seconds(0),
            maxTtl: Duration.seconds(0)
          }]
        },
        {
          customOriginSource: {
            domainName: `${api.restApiId}.execute-api.${this.region}.${this.urlSuffix}`,
            originPath: `/${api.deploymentStage.stageName}`
          },
          behaviors: [{
            allowedMethods: cloudfront.CloudFrontAllowedMethods.ALL,
            pathPattern: 'api',
            defaultTtl: Duration.seconds(0),
            maxTtl: Duration.seconds(0),
            forwardedValues: {
              queryString: true,
              cookies: {
                forward: 'all'
              }
            }
          },{
            allowedMethods: cloudfront.CloudFrontAllowedMethods.ALL,
            pathPattern: 'api/*',
            defaultTtl: Duration.seconds(0),
            maxTtl: Duration.seconds(0),
            forwardedValues: {
              queryString: true,
              cookies: {
                forward: 'all'
              }
            }
          }]
        }
      ]
    });
  }
}
