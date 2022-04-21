import {Construct} from "constructs";
import {Bucket, EventType} from "aws-cdk-lib/aws-s3";
import {Runtime} from "aws-cdk-lib/aws-lambda";
import {PythonFunction, PythonLayerVersion} from "@aws-cdk/aws-lambda-python-alpha";
import * as path from "path";
import * as cdk from "aws-cdk-lib";
import {RemovalPolicy} from "aws-cdk-lib";
import {S3EventSource} from "aws-cdk-lib/aws-lambda-event-sources";


export interface ContentLibraryConstructProps {
    prefix?: string;
}

export class ContentLibraryConstruct extends Construct {
    public readonly contentLibraryBucket: Bucket;
    private readonly processingBucket: Bucket;
    private readonly layer: PythonLayerVersion;

    constructor(scope: Construct, id: string, props: ContentLibraryConstructProps = {}) {
        super(scope, id);
        this.contentLibraryBucket = new Bucket(this, 'contentLibraryBucket');
        this.processingBucket = new Bucket(this, 'processingBucket');
        // const topic = new sns.Topic(this, 'topic');
        // bucket.addObjectCreatedNotification(new s3notify.SnsDestination(topic),
        //     { prefix: props.prefix });

        console.log(props.prefix)
        this.layer = new PythonLayerVersion(this, 'layer', {
            removalPolicy: RemovalPolicy.DESTROY,
            compatibleRuntimes: [Runtime.PYTHON_3_9],
            entry: path.join(__dirname, '..', 'lambda', 'layer'), // point this to your library's directory
        })

        this.extractorFunction('msWordExtractorFunction', ['docx', 'docm']);
        this.extractorFunction('msPowerPointExtractorFunction', ['pptx','pptm']);

        new cdk.CfnOutput(this, 'processingBucketCfnOutput', {
            value: this.processingBucket.bucketName,
            description: 'processingBucket',
        });
    }

    private extractorFunction(functionName: string, extensions: string[]) {
        const extractorFunction = new PythonFunction(this, functionName, {
            entry: path.join(__dirname, '..', 'lambda', functionName), // required
            runtime: Runtime.PYTHON_3_9, // required
            index: 'index.py', // optional, defaults to 'index.py'
            handler: 'lambda_handler', // optional, defaults to 'handler'
            layers: [this.layer],
            environment: {'processingBucket': this.processingBucket.bucketName}
        });
        extensions.map(ext => extractorFunction.addEventSource(new S3EventSource(this.contentLibraryBucket, {
            events: [EventType.OBJECT_CREATED],
            filters: [{suffix: '.' + ext}], // optional
        })));
        this.contentLibraryBucket.grantRead(extractorFunction);
        this.processingBucket.grantWrite(extractorFunction);
        return extractorFunction;
    }
}