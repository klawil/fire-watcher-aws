import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdanodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3Notifications from 'aws-cdk-lib/aws-s3-notifications';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as certmanager from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';

const bucketName = '***REMOVED***';
const certArn = '***REMOVED***';

export class FireWatcherAwsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Created outside of the CDK
    const bucket = s3.Bucket.fromBucketName(this, bucketName, bucketName);

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
    const messagesTable = new dynamodb.Table(this, 'cvfd-messages', {
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      partitionKey: {
        name: 'datetime',
        type: dynamodb.AttributeType.NUMBER
      }
    });

    // Create a handler that pushes file information into Dynamo DB
    const s3Handler = new lambdanodejs.NodejsFunction(this, 'cvfd-s3-lambda', {
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: __dirname + '/../resources/s3.ts',
      handler: 'main',
      environment: {
        TABLE_TRAFFIC: trafficTable.tableName
      }
    });
    
    // Grant access for the S3 handler
    bucket.grantRead(s3Handler);
    trafficTable.grantReadWriteData(s3Handler);

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

    // Create an API handler
    const apiHandler = new lambdanodejs.NodejsFunction(this, 'cvfd-api-lambda', {
      runtime: lambda.Runtime.NODEJS_14_X,
      entry: __dirname + '/../resources/api.ts',
      handler: 'main',
      timeout: Duration.seconds(30),
      environment: {
        BUCKET: bucketName,
        TABLE_PHONE: phoneNumberTable.tableName,
        TABLE_TRAFFIC: trafficTable.tableName,
        TABLE_MESSAGES: messagesTable.tableName
      }
    });

    // Grant access for the API handler
    bucket.grantRead(apiHandler);
    phoneNumberTable.grantReadWriteData(apiHandler);
    trafficTable.grantReadData(apiHandler);
    messagesTable.grantReadWriteData(apiHandler);

    // Create a rest API
    const api = new apigateway.RestApi(this, 'cvfd-api-gateway', {
      restApiName: 'CVFD API Gateway',
      description: 'Allow interaction from the CVFD radio website'
    });
    const apiIntegration = new apigateway.LambdaIntegration(apiHandler, {
      requestTemplates: {
        'application/json': '{"statusCode":"200"}'
      }
    });
    api.root.addResource('api').addMethod('GET', apiIntegration);

    // Create the cloudfront distribution
    const cfDistro = new cloudfront.CloudFrontWebDistribution(this, 'cvfd-cloudfront', {
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
            s3BucketSource: bucket
          },
          behaviors: [{
            isDefaultBehavior: true
          }]
        },
        {
          customOriginSource: {
            domainName: `${api.restApiId}.execute-api.${this.region}.${this.urlSuffix}`,
            originPath: `/${api.deploymentStage.stageName}`
          },
          behaviors: [{
            pathPattern: 'api',
            defaultTtl: Duration.seconds(0),
            maxTtl: Duration.seconds(0),
            forwardedValues: {
              queryString: true
            }
          }]
        }
      ]
    });
  }
}
