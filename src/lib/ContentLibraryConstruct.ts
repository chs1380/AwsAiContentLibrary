import {Construct} from "constructs";
import {Bucket, EventType} from "aws-cdk-lib/aws-s3";
import {Runtime} from "aws-cdk-lib/aws-lambda";
import {PythonFunction, PythonLayerVersion} from "@aws-cdk/aws-lambda-python-alpha";
import * as path from "path";
import * as cdk from "aws-cdk-lib";
import {RemovalPolicy} from "aws-cdk-lib";
import {S3EventSource} from "aws-cdk-lib/aws-lambda-event-sources";
import {Policy, PolicyStatement} from "aws-cdk-lib/aws-iam";
import {Topic} from "aws-cdk-lib/aws-sns";
import {EmailSubscription} from "aws-cdk-lib/aws-sns-subscriptions";


export interface ContentLibraryConstructProps {
    prefix: string;
    adminEmail?: string;
}

export class ContentLibraryConstruct extends Construct {
    public readonly contentLibraryBucket: Bucket;
    private readonly processingBucket: Bucket;
    private readonly moderationBucket: Bucket;
    private readonly layer: PythonLayerVersion;
    private readonly prefix: string;
    private readonly moderationTopic: Topic;

    constructor(scope: Construct, id: string, props: ContentLibraryConstructProps = {prefix: ""}) {
        super(scope, id);
        this.contentLibraryBucket = new Bucket(this, 'contentLibraryBucket');
        this.processingBucket = new Bucket(this, 'processingBucket');
        this.moderationBucket = new Bucket(this, 'moderationBucket');
        this.moderationTopic = new Topic(this, 'moderationTopic');

        if(props.adminEmail)
            this.moderationTopic.addSubscription(new EmailSubscription(props.adminEmail!))

        this.prefix = props.prefix;

        this.layer = new PythonLayerVersion(this, 'layer', {
            removalPolicy: RemovalPolicy.DESTROY,
            compatibleRuntimes: [Runtime.PYTHON_3_9],
            entry: path.join(__dirname, '..', 'lambda', 'layer'), // point this to your library's directory
        })

        this.extractorFunction('msWordExtractorFunction', ['docx', 'docm']);
        this.extractorFunction('msPowerPointExtractorFunction', ['pptx', 'pptm']);
        const imageModeratorFunction = this.moderatorFunction('imageModeratorFunction', ['jpeg', 'jpg', 'png']);
        imageModeratorFunction.role?.attachInlinePolicy(
            new Policy(this, 'imageModeratorFunctionPolicy', {
                statements: [new PolicyStatement({
                    actions: ['rekognition:DetectText', 'rekognition:DetectModerationLabels'],
                    resources: ['*'],
                })],
            }),
        );
        this.moderatorFunction('textModeratorFunction', ['txt', 'json']);
        const videoModeratorFunction = this.moderatorFunction('videoModeratorFunction', ['mp4', 'mov']);
        videoModeratorFunction.role?.attachInlinePolicy(
            new Policy(this, 'videoModeratorFunctionPolicy', {
                statements: [new PolicyStatement({
                    actions: ['rekognition:GetContentModeration', 'rekognition:StartContentModeration'],
                    resources: ['*'],
                })],
            }),
        );

        new cdk.CfnOutput(this, 'processingBucketCfnOutput', {
            value: this.processingBucket.bucketName,
            description: 'processingBucket',
        });
    }

    private extractorFunction(functionName: string, extensions: string[]) {
        return this.getProcessingFunction(functionName, extensions, this.contentLibraryBucket, this.processingBucket);
    }

    private moderatorFunction(functionName: string, extensions: string[]) {
        const f = this.getProcessingFunction(functionName, extensions, this.processingBucket, this.moderationBucket);
        this.processingBucket.grantWrite(f);
        this.moderationTopic.grantPublish(f);
        return f;
    }

    private getProcessingFunction(functionName: string, extensions: string[], triggerSourceBucket: Bucket, resultBucket: Bucket) {
        const processingFunction = new PythonFunction(this, functionName, {
            entry: path.join(__dirname, '..', 'lambda', functionName), // required
            description: this.prefix + functionName,
            runtime: Runtime.PYTHON_3_9, // required
            index: 'index.py', // optional, defaults to 'index.py'
            handler: 'lambda_handler', // optional, defaults to 'handler'
            layers: [this.layer],
            environment: {
                'processingBucket': this.processingBucket.bucketName,
                'moderationBucket': this.moderationBucket.bucketName,
                'moderationTopic': this.moderationTopic.topicArn
            }
        });
        extensions.map(ext => processingFunction.addEventSource(new S3EventSource(triggerSourceBucket, {
            events: [EventType.OBJECT_CREATED],
            filters: [{suffix: '.' + ext}], // optional
        })));
        triggerSourceBucket.grantRead(processingFunction);
        resultBucket.grantWrite(processingFunction);
        return processingFunction;
    }
}