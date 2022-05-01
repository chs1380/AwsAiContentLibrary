import { App, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { ContentLibraryConstruct } from "./lib/ContentLibraryConstruct";
import * as cdk from "aws-cdk-lib";
import * as dotenv from "dotenv";

export class AwsAiContentLibraryStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps = {}) {
    super(scope, id, props);

    dotenv.config({ path: __dirname + "/../.env" });
    console.log("adminEmail: " + process.env.adminEmail);
    const contentLibraryConstruct = new ContentLibraryConstruct(
      this,
      "contentLibraryConstruct",
      {
        prefix: "dev",
        adminEmail: process.env.adminEmail,
      }
    );

    // 👇 create an Output
    new cdk.CfnOutput(this, "contentLibraryBucket", {
      value: contentLibraryConstruct.contentLibraryBucket.bucketName,
      description: "Content Library Bucket",
    });
    new cdk.CfnOutput(this, "moderationFailedBucket", {
      value: contentLibraryConstruct.moderationFailedBucket.bucketName,
      description: "Moderation Failed Bucket",
    });
    new cdk.CfnOutput(this, "moderationResultTable", {
      value: contentLibraryConstruct.moderationResultTable.tableName,
      description: "Moderation Result Table",
    });
    new cdk.CfnOutput(this, "moderationFailedTopic", {
      value: contentLibraryConstruct.moderationFailedTopic.topicArn,
      description: "Moderation Failed Topic",
    });
  }
}

// for development, use account/region from cdk cli
const devEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: "us-east-1",
};

const app = new App();

new AwsAiContentLibraryStack(app, "AwsAiContentLibrary-dev1", { env: devEnv });
// new MyStack(app, 'AwsAiContentLibrary-prod', { env: prodEnv });

app.synth();
