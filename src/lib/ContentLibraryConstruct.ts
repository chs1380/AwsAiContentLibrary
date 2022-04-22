import {Construct} from "constructs";
import {Bucket, EventType} from "aws-cdk-lib/aws-s3";
import {DockerImageCode, DockerImageFunction, Runtime, Tracing} from "aws-cdk-lib/aws-lambda";
import {PythonFunction, PythonLayerVersion} from "@aws-cdk/aws-lambda-python-alpha";
import * as path from "path";
import {Duration, RemovalPolicy} from "aws-cdk-lib";
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
    private readonly commonLayer: PythonLayerVersion;
    private readonly prefix: string;
    private readonly moderationTopic: Topic;

    constructor(scope: Construct, id: string, props: ContentLibraryConstructProps = {prefix: ""}) {
        super(scope, id);
        this.contentLibraryBucket = new Bucket(this, 'contentLibraryBucket', {removalPolicy: RemovalPolicy.DESTROY});
        this.processingBucket = new Bucket(this, 'processingBucket', {removalPolicy: RemovalPolicy.DESTROY});
        this.moderationTopic = new Topic(this, 'moderationTopic');

        if (props.adminEmail)
            this.moderationTopic.addSubscription(new EmailSubscription(props.adminEmail!))

        this.prefix = props.prefix;

        this.commonLayer = new PythonLayerVersion(this, 'commonLayer', {
            removalPolicy: RemovalPolicy.DESTROY,
            compatibleRuntimes: [Runtime.PYTHON_3_9],
            entry: path.join(__dirname, '..', 'lambda', 'commonLayer'), // point this to your library's directory
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
        // const textModeratorFunction = this.moderatorFunction('textModeratorFunction', ['txt', 'json']);
        this.buildTextModeratorFunction();

        const videoModeratorFunction = this.moderatorFunction('videoModeratorFunction', ['mp4', 'mov']);
        videoModeratorFunction.role?.attachInlinePolicy(
            new Policy(this, 'videoModeratorFunctionPolicy', {
                statements: [new PolicyStatement({
                    actions: ['rekognition:GetContentModeration', 'rekognition:StartContentModeration'],
                    resources: ['*'],
                })],
            }),
        );

    }

    private buildTextModeratorFunction() {
        const textModeratorFunction = new DockerImageFunction(this, 'textModeratorFunction', {
            code: DockerImageCode.fromImageAsset(path.join(__dirname, '..', 'lambda', 'textModeratorFunction'), {
                cmd: ['index.lambda_handler'],
            }),
            memorySize: 8096,
            timeout: Duration.minutes(10),
            environment: {
                'processingBucket': this.processingBucket.bucketName,
                'moderationTopic': this.moderationTopic.topicArn
            },
            tracing: Tracing.ACTIVE,
        });
        this.contentLibraryBucket.grantReadWrite(textModeratorFunction);
        this.processingBucket.grantReadWrite(textModeratorFunction);
        ['json', 'txt'].map(ext => textModeratorFunction.addEventSource(new S3EventSource(this.processingBucket, {
            events: [EventType.OBJECT_CREATED],
            filters: [{suffix: '.' + ext}], // optional
        })));
        this.moderationTopic.grantPublish(textModeratorFunction);
    }

    private extractorFunction(functionName: string, extensions: string[]) {
        return this.getProcessingFunction(functionName, extensions, this.contentLibraryBucket, this.processingBucket);
    }

    private moderatorFunction(functionName: string, extensions: string[], memorySize: number = 512) {
        const f = this.getProcessingFunction(functionName, extensions, this.processingBucket, undefined, memorySize);
        this.processingBucket.grantReadWrite(f);
        this.moderationTopic.grantPublish(f);
        return f;
    }

    private getProcessingFunction(functionName: string, extensions: string[], triggerSourceBucket: Bucket, resultBucket: Bucket| undefined, memorySize: number = 512) {
        const processingFunction = new PythonFunction(this, functionName, {
            entry: path.join(__dirname, '..', 'lambda', functionName), // required
            description: this.prefix + functionName,
            runtime: Runtime.PYTHON_3_9, // required
            index: 'index.py', // optional, defaults to 'index.py'
            handler: 'lambda_handler', // optional, defaults to 'handler'
            layers: [this.commonLayer],
            environment: {
                'processingBucket': this.processingBucket.bucketName,
                'moderationTopic': this.moderationTopic.topicArn
            },
            timeout: Duration.minutes(5),
            memorySize,
            tracing: Tracing.ACTIVE,
        });
        extensions.map(ext => processingFunction.addEventSource(new S3EventSource(triggerSourceBucket, {
            events: [EventType.OBJECT_CREATED],
            filters: [{suffix: '.' + ext}], // optional
        })));
        triggerSourceBucket.grantReadWrite(processingFunction);
        resultBucket?.grantReadWrite(processingFunction);
        return processingFunction;
    }
}