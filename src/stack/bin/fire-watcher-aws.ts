import * as cdk from 'aws-cdk-lib';
import { FireWatcherAwsStack } from '../lib/fire-watcher-aws-stack';

const app = new cdk.App();
new FireWatcherAwsStack(app, 'FireWatcherAwsStack', {
  env: { region: 'us-east-2' },
});