import { Construct } from "constructs";
import { LambdaBuilderConstruct } from "./LambdaBuilderConstruct";
import {
  Policy,
  PolicyStatement,
  PolicyDocument,
  CfnRole,
} from "aws-cdk-lib/aws-iam";
import * as cr from "aws-cdk-lib/custom-resources";

export interface VideoConvertorConstructProps {
  lambdaBuilderConstruct: LambdaBuilderConstruct;
}

export class VideoConvertorConstruct extends Construct {
  constructor(
    scope: Construct,
    id: string,
    props: VideoConvertorConstructProps
  ) {
    super(scope, id);
    const lambdaBuilderConstruct = props.lambdaBuilderConstruct;

    const getMediaconvertEndPoint = new cr.AwsCustomResource(
      this,
      "GetMediaconvertEndPoint",
      {
        onCreate: {
          service: "MediaConvert",
          action: "describeEndpoints",
          physicalResourceId: cr.PhysicalResourceId.of("id"),
        },
        policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
          resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
        }),
      }
    );

    const s3PolicyDocument = new PolicyDocument({
      statements: [
        new PolicyStatement({
          resources: ["*"],
          actions: ["s3:*"],
        }),
        new PolicyStatement({
          resources: ["*"],
          actions: ["autoscaling:Describe*", "cloudwatch:*", "logs:*", "sns:*"],
        }),
      ],
    });

    const mediaConvertRole = new CfnRole(this, "MyCfnRole", {
      assumeRolePolicyDocument: {
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              Service: [
                "mediaconvert.amazonaws.com",
                "mediaconvert.us-east-1.amazonaws.com",
                "mediaconvert.ap-northeast-1.amazonaws.com",
                "mediaconvert.ap-southeast-1.amazonaws.com",
                "mediaconvert.ap-southeast-2.amazonaws.com",
                "mediaconvert.eu-central-1.amazonaws.com",
                "mediaconvert.eu-west-1.amazonaws.com",
                "mediaconvert.us-east-1.amazonaws.com",
                "mediaconvert.us-west-1.amazonaws.com",
                "mediaconvert.us-west-2.amazonaws.com",
              ],
            },
            Action: ["sts:AssumeRole"],
          },
        ],
      },
      policies: [
        {
          policyDocument: s3PolicyDocument,
          policyName: "policyName",
        },
      ],
    });

    const videoConvertorFunction = lambdaBuilderConstruct.moderatorFunction(
      "videoConvertorFunction",
      ["mov", "wmv", "avi", "flv", "mkv", "webm"]
    );
    videoConvertorFunction.role?.attachInlinePolicy(
      new Policy(this, "videoConvertorFunctionPolicy", {
        statements: [
          new PolicyStatement({
            actions: ["iam:PassRole"],
            resources: [mediaConvertRole.attrArn],
          }),
          new PolicyStatement({
            actions: ["mediaconvert:*"],
            resources: ["*"],
          }),
        ],
      })
    );

    videoConvertorFunction.addEnvironment(
      "MediaconvertEndPoint",
      getMediaconvertEndPoint.getResponseField("Endpoints.0.Url")
    );
    videoConvertorFunction.addEnvironment(
      "MediaConvertRole",
      mediaConvertRole.attrArn
    );
  }
}
