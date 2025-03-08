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

const bucketName = '***REMOVED***';
const certArn = '***REMOVED***';
const secretArn = '***REMOVED***';
const apiCode = '***REMOVED***';

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
    const trafficTable = new dynamodb.Table(this, 'cvfd-traffic', {
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
    const messagesTable = new dynamodb.Table(this, 'cvfd-messages', {
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

    trafficTable.addGlobalSecondaryIndex({
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
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: __dirname + '/../resources/s3.ts',
      handler: 'main',
      environment: {
        TABLE_TRAFFIC: trafficTable.tableName,
        TABLE_DTR: dtrTable.tableName,
        TABLE_TALKGROUP: talkgroupTable.tableName,
        SQS_QUEUE: queue.queueUrl
      }
    });
    
    // Grant access for the S3 handler
    bucket.grantRead(s3Handler);
    trafficTable.grantReadWriteData(s3Handler);
    dtrTable.grantReadWriteData(s3Handler);
    talkgroupTable.grantReadWriteData(s3Handler);
    queue.grantSendMessages(s3Handler);

    // Create a handler for the SQS queue
    const queueHandler = new lambdanodejs.NodejsFunction(this, 'cvfd-queue-lambda', {
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: __dirname + '/../resources/queue.ts',
      handler: 'main',
      environment: {
        TABLE_PHONE: phoneNumberTable.tableName,
        TABLE_TRAFFIC: trafficTable.tableName,
        TABLE_MESSAGES: messagesTable.tableName,
        TWILIO_SECRET: secretArn,
        SERVER_CODE: apiCode
      },
      timeout: Duration.minutes(1)
    });
    queueHandler.addEventSource(new lambdaEventSources.SqsEventSource(queue));

    // Grant access for the queue handler
    phoneNumberTable.grantReadWriteData(queueHandler);
    trafficTable.grantReadData(queueHandler);
    messagesTable.grantReadWriteData(queueHandler);
    twilioSecret.grantRead(queueHandler);

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

    // Create an API handler
    const apiHandler = new lambdanodejs.NodejsFunction(this, 'cvfd-api-lambda', {
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: __dirname + '/../resources/api.ts',
      handler: 'main',
      environment: {
        TABLE_PHONE: phoneNumberTable.tableName,
        TABLE_TRAFFIC: trafficTable.tableName,
        TABLE_DTR: dtrTable.tableName,
        TABLE_TALKGROUP: talkgroupTable.tableName,
        TABLE_MESSAGES: messagesTable.tableName,
        TABLE_STATUS: statusTable.tableName,
        SQS_QUEUE: queue.queueUrl,
        SERVER_CODE: apiCode,
        S3_BUCKET: bucket.bucketName
      },
      timeout: Duration.seconds(10)
    });

    // Grant access for the API handler
    phoneNumberTable.grantReadWriteData(apiHandler);
    trafficTable.grantReadData(apiHandler);
    dtrTable.grantReadWriteData(apiHandler);
    talkgroupTable.grantReadData(apiHandler);
    messagesTable.grantReadWriteData(apiHandler);
    statusTable.grantReadWriteData(apiHandler);
    queue.grantSendMessages(apiHandler);
    bucket.grantRead(apiHandler);

    // Create a rest API
    const api = new apigateway.RestApi(this, 'cvfd-api-gateway', {
      restApiName: 'CVFD API Gateway',
      description: 'Allow interaction from the CVFD radio website'
    });
    const apiIntegration = new apigateway.LambdaIntegration(apiHandler, {
      requestTemplates: {
        'application/json': '{"statusCode":"200"}',
        'application/xml': '<Response></Response>'
      }
    });
    const apiResource = api.root.addResource('api');
    apiResource.addMethod('GET', apiIntegration)
    apiResource.addMethod('POST', apiIntegration)

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
          }]
        }
      ]
    });
  }
}
