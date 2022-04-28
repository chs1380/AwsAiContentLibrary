import {Construct} from "constructs";
import {Policy} from "aws-cdk-lib/aws-iam";
import {HuggingFaceSagemakerServerlessInferenceConstruct} from "./HuggingFaceSagemakerServerlessInferenceConstruct";
import {DockerImageCode, DockerImageFunction, Tracing} from "aws-cdk-lib/aws-lambda";
import path from "path";
import {Duration} from "aws-cdk-lib";
import {S3EventSource} from "aws-cdk-lib/aws-lambda-event-sources";
import { EventType} from "aws-cdk-lib/aws-s3";
import {LambdaBuilderConstruct} from "./LambdaBuilderConstruct";


export interface TextModeratorConstructProps {
    lambdaBuilderConstruct: LambdaBuilderConstruct;
}

export class TextModeratorConstruct extends Construct {
    constructor(
        scope: Construct,
        id: string,
        props: TextModeratorConstructProps
    ) {
        super(scope, id);
        const lambdaBuilderConstruct = props.lambdaBuilderConstruct;
        const huggingFaceSagemakerServerlessInferenceConstruct =
            new HuggingFaceSagemakerServerlessInferenceConstruct(
                this,
                "huggingFaceSagemakerServerlessInferenceConstruct",
                {
                    hfModelId: "cardiffnlp/twitter-roberta-base-offensive",
                    hfTask: "text-classification",
                }
            );
        const textModeratorFunction = new DockerImageFunction(
            this,
            "textModeratorFunction",
            {
                code: DockerImageCode.fromImageAsset(
                    path.join(
                        __dirname,
                        "..",
                        "..",
                        "lambda",
                        "textModeratorFunction"
                    ),
                    {
                        cmd: ["index.lambda_handler"],
                    }
                ),
                memorySize: 2048,
                timeout: Duration.minutes(10),
                environment: {
                    processingBucket: lambdaBuilderConstruct.processingBucket.bucketName,
                    moderationTopic: lambdaBuilderConstruct.moderationTopic.topicArn,
                    huggingFaceModelEndpointName:
                    huggingFaceSagemakerServerlessInferenceConstruct.endpointName,
                },
                tracing: Tracing.ACTIVE,
            }
        );
        lambdaBuilderConstruct.contentLibraryBucket.grantReadWrite(textModeratorFunction);
        lambdaBuilderConstruct.processingBucket.grantReadWrite(textModeratorFunction);
        ["json", "txt"].map((ext) =>
            textModeratorFunction.addEventSource(
                new S3EventSource(lambdaBuilderConstruct.processingBucket, {
                    events: [EventType.OBJECT_CREATED],
                    filters: [{suffix: "." + ext}], // optional
                })
            )
        );
        lambdaBuilderConstruct.moderationTopic.grantPublish(textModeratorFunction);
        textModeratorFunction.role?.attachInlinePolicy(
            new Policy(this, "offensiveTextModeratorFunctionPolicy", {
                statements: [
                    huggingFaceSagemakerServerlessInferenceConstruct.invokeEndPointPolicyStatement,
                ],
            })
        );
    }
}