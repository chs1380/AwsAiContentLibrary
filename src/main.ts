import { App, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {ContentLibraryConstruct} from "./lib/ContentLibraryConstruct";
import * as cdk from 'aws-cdk-lib';

export class AwsAiContentLibraryStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);
    const contentLibraryConstruct = new ContentLibraryConstruct(this,"contentLibraryConstruct",{prefix:"dev"});

    // 👇 create an Output
    new cdk.CfnOutput(this, 'bucketName', {
      value: contentLibraryConstruct.contentLibraryBucket.bucketName,
      description: 'Content Library Bucket',
    });

  }
}

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: 'us-east-1',
};

const app = new App();

new AwsAiContentLibraryStack(app, 'AwsAiContentLibrary-dev', { env: devEnv });
// new MyStack(app, 'AwsAiContentLibrary-prod', { env: prodEnv });

app.synth();