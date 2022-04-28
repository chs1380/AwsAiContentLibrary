import {Construct} from "constructs";
import {LambdaBuilderConstruct} from "./LambdaBuilderConstruct";
import {Policy, PolicyStatement, Role, ServicePrincipal} from "aws-cdk-lib/aws-iam";
import {LambdaSubscription} from "aws-cdk-lib/aws-sns-subscriptions";
import {Topic} from "aws-cdk-lib/aws-sns";

export interface VideoModerationConstructProps {
    lambdaBuilderConstruct: LambdaBuilderConstruct;
}


export class VideoModeratorConstruct extends Construct {
    constructor(
        scope: Construct,
        id: string,
        props: VideoModerationConstructProps
    ) {
        super(scope, id);
        const lambdaBuilderConstruct = props.lambdaBuilderConstruct;

        const videoContentModerationTopic = new Topic(
            this,
            "videoContentModerationTopic"
        );

        const rekognitionServiceRole = new Role(this, "rekognitionServiceRole", {
            assumedBy: new ServicePrincipal("rekognition.amazonaws.com"),
        });
        videoContentModerationTopic.grantPublish(rekognitionServiceRole);

        const videoModeratorFunction = lambdaBuilderConstruct.moderatorFunction(
            "videoModeratorFunction",
            ["mp4"]
        );
        videoModeratorFunction.role?.attachInlinePolicy(
            new Policy(this, "videoModeratorFunctionPolicy", {
                statements: [
                    new PolicyStatement({
                        actions: ["rekognition:StartContentModeration"],
                        resources: ["*"],
                    }),
                    new PolicyStatement({
                        actions: ["iam:PassRole"],
                        resources: [rekognitionServiceRole.roleArn],
                    }),
                    new PolicyStatement({
                        actions: ["transcribe:StartTranscriptionJob"],
                        resources: ["*"],
                        conditions: {
                            StringEquals: {
                                "transcribe:OutputBucketName": lambdaBuilderConstruct.processingBucket.bucketName,
                            },
                        },
                    }),
                ],
            })
        );
        videoModeratorFunction.addEnvironment(
            "videoContentModerationTopic",
            videoContentModerationTopic.topicArn
        );
        videoModeratorFunction.addEnvironment(
            "rekognitionServiceRole",
            rekognitionServiceRole.roleArn
        );

        const videoModeratorCallbackFunction = lambdaBuilderConstruct.moderatorFunction(
            "videoModeratorCallbackFunction",
            []
        );
        videoModeratorCallbackFunction.role?.attachInlinePolicy(
            new Policy(this, "videoModeratorCallbackFunctionPolicy", {
                statements: [
                    new PolicyStatement({
                        actions: ["rekognition:GetContentModeration"],
                        resources: ["*"],
                    }),
                ],
            })
        );
        videoContentModerationTopic.addSubscription(
            new LambdaSubscription(videoModeratorCallbackFunction)
        );
    }
}
