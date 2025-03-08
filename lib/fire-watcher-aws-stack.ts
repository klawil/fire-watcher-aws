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

const bucketName = '***REMOVED***';
const certArn = '***REMOVED***';
const secretArn = '***REMOVED***';
const apiCode = '***REMOVED***';

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
    const vhfTable = new dynamodb.Table(this, 'cvfd-traffic', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'Key',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'Datetime',
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
    const deviceTable = new dynamodb.Table(this, 'cvfd-devices', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'ID',
        type: dynamodb.AttributeType.NUMBER
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

    vhfTable.addGlobalSecondaryIndex({
      indexName: 'ToneIndex',
      partitionKey: {
        name: 'ToneIndex',
        type: dynamodb.AttributeType.STRING
      },
      sortKey: {
        name: 'Datetime',
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
        })
      ],
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: __dirname + '/../resources/s3.ts',
      handler: 'main',
      environment: {
        TABLE_TRAFFIC: vhfTable.tableName,
        TABLE_DTR: dtrTable.tableName,
        TABLE_TALKGROUP: talkgroupTable.tableName,
        TABLE_DEVICE: deviceTable.tableName,
        SQS_QUEUE: queue.queueUrl
      }
    });
    
    // Grant access for the S3 handler
    bucket.grantRead(s3Handler);
    vhfTable.grantReadWriteData(s3Handler);
    dtrTable.grantReadWriteData(s3Handler);
    talkgroupTable.grantReadWriteData(s3Handler);
    deviceTable.grantReadWriteData(s3Handler);
    queue.grantSendMessages(s3Handler);

    // Create a handler for the SQS queue
    const queueHandler = new lambdanodejs.NodejsFunction(this, 'cvfd-queue-lambda', {
      initialPolicy: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [ 'cloudwatch:PutMetricData' ],
          resources: [ '*' ]
        })
      ],
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: __dirname + '/../resources/queue.ts',
      handler: 'main',
      environment: {
        TABLE_PHONE: phoneNumberTable.tableName,
        TABLE_TRAFFIC: vhfTable.tableName,
        TABLE_MESSAGES: textsTable.tableName,
        TWILIO_SECRET: secretArn,
        SERVER_CODE: apiCode
      },
      timeout: Duration.minutes(1)
    });
    queueHandler.addEventSource(new lambdaEventSources.SqsEventSource(queue));

    // Grant access for the queue handler
    phoneNumberTable.grantReadWriteData(queueHandler);
    vhfTable.grantReadData(queueHandler);
    textsTable.grantReadWriteData(queueHandler);
    twilioSecret.grantRead(queueHandler);

    // Create a queue for cloudwatch alarms
    const alarmQueue = new sqs.Queue(this, 'cvfd-alarm-queue');
    const alarmQueueHandler = new lambdanodejs.NodejsFunction(this, 'cvfd-alarm-queue-lambda', {
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: __dirname + '/../resources/alarms.ts',
      handler: 'main',
      timeout: Duration.seconds(30),
      environment: {
        TWILIO_SECRET: secretArn
      }
    });
    alarmQueueHandler.addEventSource(new lambdaEventSources.SqsEventSource(alarmQueue));
    twilioSecret.grantRead(alarmQueueHandler);

    const alarmTopic = new sns.Topic(this, 'cvfd-alarm-topic');
    alarmTopic.addSubscription(new subscriptions.SqsSubscription(alarmQueue));
    const alarmAction = new cw_actions.SnsAction(alarmTopic);

    const baseTowerAlarmConfig: cloudwatch.AlarmProps = {
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      metric: new cloudwatch.Metric({
        metricName: 'Decode Rate',
        namespace: 'DTR Metrics',
        period: Duration.seconds(30),
        statistic: cloudwatch.Statistic.MINIMUM,
        dimensionsMap: {
          Tower: 'Saguache Tower'
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
        period: Duration.seconds(30),
        statistic: cloudwatch.Statistic.SUM,
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
    const alarms: CvfdAlarm[] = [
      {
        codeName: 'saguache-tower',
        alarm: {
          ...baseTowerAlarmConfig,
          metric: new cloudwatch.Metric({
            metricName: 'Decode Rate',
            namespace: 'DTR Metrics',
            period: Duration.seconds(30),
            statistic: cloudwatch.Statistic.MINIMUM,
            dimensionsMap: {
              Tower: 'Saguache Tower'
            }
          }),
          alarmDescription: 'Saguache Tower Decode Rate below 40/min',
          alarmName: 'Saguache Tower'
        }
      },
      // {
      //   codeName: 'pool-table-tower',
      //   alarm: {
      //     ...baseTowerAlarmConfig,
      //     metric: new cloudwatch.Metric({
      //       metricName: 'Decode Rate',
      //       namespace: 'DTR Metrics',
      //       period: Duration.seconds(30),
      //       statistic: cloudwatch.Statistic.MINIMUM,
      //       dimensionsMap: {
      //         Tower: 'Pool Table Mountain'
      //       }
      //     }),
      //     alarmDescription: 'Pool Table Tower Decode Rate below 40/min',
      //     alarmName: 'Pool Table Tower'
      //   }
      // },
      {
        codeName: 'user-api',
        okayAction: false,
        alarm: {
          ...baseApiAlarmConfig,
          metric: new cloudwatch.Metric({
            metricName: 'Error',
            namespace: 'CVFD API',
            period: Duration.seconds(30),
            statistic: cloudwatch.Statistic.SUM,
            dimensionsMap: {
              source: 'User'
            }
          }),
          alarmDescription: 'User API error occured',
          alarmName: 'User API Error'
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
            period: Duration.seconds(30),
            statistic: cloudwatch.Statistic.SUM,
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
            period: Duration.seconds(30),
            statistic: cloudwatch.Statistic.SUM,
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
            period: Duration.seconds(30),
            statistic: cloudwatch.Statistic.SUM,
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
            period: Duration.seconds(30),
            statistic: cloudwatch.Statistic.SUM,
            dimensionsMap: {
              source: 'S3'
            }
          }),
          alarmDescription: 'S3 API error occured',
          alarmName: 'S3 API Error'
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

    // Create the status parser function
    const statusHandler = new lambdanodejs.NodejsFunction(this, 'cvfd-status-lambda', {
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: __dirname + '/../resources/status.ts',
      handler: 'main',
      environment: {
        TABLE_STATUS: statusTable.tableName,
        TWILIO_SECRET: secretArn
      },
      timeout: Duration.minutes(1)
    });

    // Grant access for the status handler
    statusTable.grantReadWriteData(statusHandler);
    twilioSecret.grantRead(statusHandler);

    // Schedule the function for every minute
    const statusEventRule = new events.Rule(this, 'status-rule', {
      schedule: events.Schedule.cron({})
    });
    statusEventRule.addTarget(new targets.LambdaFunction(statusHandler));

    // Create the weather updater
    const weatherUpdater = new lambdanodejs.NodejsFunction(this, 'cvfd-weather-lambda', {
      runtime: lambda.Runtime.NODEJS_14_X,
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
      schedule: events.Schedule.cron({})
    });
    weatherEventRule.addTarget(new targets.LambdaFunction(weatherUpdater));

    // Create a rest API
    const api = new apigateway.RestApi(this, 'cvfd-api-gateway', {
      restApiName: 'CVFD API Gateway',
      description: 'Allow interaction from the CVFD radio website'
    });
    const apiResource = api.root.addResource('api');

    // Create the frontend API
    const frontendApiHandler = new lambdanodejs.NodejsFunction(this, 'cvfd-api-frontend-lambda', {
      initialPolicy: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [ 'cloudwatch:PutMetricData' ],
          resources: [ '*' ]
        })
      ],
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: __dirname + '/../resources/api/frontend.ts',
      handler: 'main',
      environment: {
        TABLE_VHF: vhfTable.tableName,
        TABLE_DTR: dtrTable.tableName,
        TABLE_TALKGROUP: talkgroupTable.tableName,
        TABLE_DEVICE: deviceTable.tableName,
        TABLE_TEXTS: textsTable.tableName,
        TABLE_USER: phoneNumberTable.tableName
      }
    });
    vhfTable.grantReadData(frontendApiHandler);
    dtrTable.grantReadData(frontendApiHandler);
    talkgroupTable.grantReadData(frontendApiHandler);
    deviceTable.grantReadData(frontendApiHandler);
    textsTable.grantReadData(frontendApiHandler);
    phoneNumberTable.grantReadData(frontendApiHandler);
    const frontendApiIntegration = new apigateway.LambdaIntegration(frontendApiHandler, {
      requestTemplates: {
        'application/json': '{"statusCode":"200"}'
      }
    });
    const frontendApiResource = apiResource.addResource('frontend');
    frontendApiResource.addMethod('GET', frontendApiIntegration);

    // Create the infrastructure API
    const infraApiHandler = new lambdanodejs.NodejsFunction(this, 'cvfd-api-infra-lambda', {
      initialPolicy: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [ 'cloudwatch:PutMetricData' ],
          resources: [ '*' ]
        })
      ],
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: __dirname + '/../resources/api/infra.ts',
      handler: 'main',
      environment: {
        SERVER_CODE: apiCode,
        S3_BUCKET: bucket.bucketName,
        SQS_QUEUE: queue.queueUrl,
        TABLE_DTR: dtrTable.tableName,
        TABLE_USER: phoneNumberTable.tableName,
        TABLE_TEXT: textsTable.tableName,
        TABLE_STATUS: statusTable.tableName
      },
      timeout: Duration.seconds(10)
    });
    bucket.grantRead(infraApiHandler);
    queue.grantSendMessages(infraApiHandler);
    dtrTable.grantReadData(infraApiHandler);
    phoneNumberTable.grantReadWriteData(infraApiHandler);
    textsTable.grantReadData(infraApiHandler);
    statusTable.grantReadWriteData(infraApiHandler);
    const infraApiIntegration = new apigateway.LambdaIntegration(infraApiHandler, {
      requestTemplates: {
        'application/json': '{"statusCode":"200"}'
      }
    });
    const infraApiResource = apiResource.addResource('infra');
    infraApiResource.addMethod('GET', infraApiIntegration);
    infraApiResource.addMethod('POST', infraApiIntegration);

    // Create the user API
    const userApiHandler = new lambdanodejs.NodejsFunction(this, 'cvfd-api-user-lambda', {
      initialPolicy: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [ 'cloudwatch:PutMetricData' ],
          resources: [ '*' ]
        })
      ],
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: __dirname + '/../resources/api/user.ts',
      handler: 'main',
      environment: {
        QUEUE_URL: queue.queueUrl,
        TABLE_USER: phoneNumberTable.tableName
      },
      timeout: Duration.seconds(10)
    });
    queue.grantSendMessages(userApiHandler);
    phoneNumberTable.grantReadWriteData(userApiHandler);
    const userApiIntegration = new apigateway.LambdaIntegration(userApiHandler, {
      requestTemplates: {
        'application/json': '{"statusCode":"200"}'
      }
    });
    const userApiResource = apiResource.addResource('user');
    userApiResource.addMethod('GET', userApiIntegration);
    userApiResource.addMethod('POST', userApiIntegration);

    // Create the twilio API
    const twilioApiHandler = new lambdanodejs.NodejsFunction(this, 'cvfd-api-twilio-lambda', {
      initialPolicy: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [ 'cloudwatch:PutMetricData' ],
          resources: [ '*' ]
        })
      ],
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: __dirname + '/../resources/api/twilio.ts',
      handler: 'main',
      environment: {
        SERVER_CODE: apiCode,
        SQS_QUEUE: queue.queueUrl,
        TABLE_USER: phoneNumberTable.tableName,
        TABLE_TEXT: textsTable.tableName
      },
      timeout: Duration.seconds(10)
    });
    queue.grantSendMessages(twilioApiHandler);
    phoneNumberTable.grantReadWriteData(twilioApiHandler);
    textsTable.grantReadWriteData(twilioApiHandler);
    const twilioApiIntegration = new apigateway.LambdaIntegration(twilioApiHandler, {
      requestTemplates: {
        'application/json': '{"statusCode":"200"}'
      }
    });
    const twilioApiResource = apiResource.addResource('twilio');
    twilioApiResource.addMethod('GET', twilioApiIntegration);
    twilioApiResource.addMethod('POST', twilioApiIntegration);

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
