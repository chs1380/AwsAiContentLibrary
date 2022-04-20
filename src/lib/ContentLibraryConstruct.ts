import {Construct} from "constructs";
import {Bucket, EventType} from "aws-cdk-lib/aws-s3";
import {Runtime} from "aws-cdk-lib/aws-lambda";
import {PythonFunction, PythonLayerVersion} from "@aws-cdk/aws-lambda-python-alpha";
import * as path from "path";
import {RemovalPolicy} from "aws-cdk-lib";
import {S3EventSource} from "aws-cdk-lib/aws-lambda-event-sources";
import * as cdk from "aws-cdk-lib";


export interface ContentLibraryConstructProps {
    prefix?: string;
}

export class ContentLibraryConstruct extends Construct {
    public readonly contentLibraryBucket: Bucket;

    constructor(scope: Construct, id: string, props: ContentLibraryConstructProps = {}) {
        super(scope, id);
        this.contentLibraryBucket = new Bucket(this, 'contentLibraryBucket');
        const processingBucket = new Bucket(this, 'processingBucket');
        // const topic = new sns.Topic(this, 'topic');
        // bucket.addObjectCreatedNotification(new s3notify.SnsDestination(topic),
        //     { prefix: props.prefix });

        new cdk.CfnOutput(this, 'processingBucketCfnOutput', {
            value: processingBucket.bucketName,
            description: 'processingBucket',
        });

        console.log(props.prefix)
        const layer = new PythonLayerVersion(this, 'layer', {
            removalPolicy: RemovalPolicy.DESTROY,
            compatibleRuntimes: [Runtime.PYTHON_3_9],
            entry: path.join(__dirname, '..', 'lambda', 'layer'), // point this to your library's directory
        })
        const msWordExtractorFunction = new PythonFunction(this, 'msWordExtractorFunction', {
            entry: path.join(__dirname, '..', 'lambda', 'msWordExtractorFunction'), // required
            runtime: Runtime.PYTHON_3_9, // required
            index: 'index.py', // optional, defaults to 'index.py'
            handler: 'lambda_handler', // optional, defaults to 'handler'
            layers: [layer],
            environment: {'processingBucket': processingBucket.bucketName}
        });
        msWordExtractorFunction.addEventSource(new S3EventSource(this.contentLibraryBucket, {
            events: [EventType.OBJECT_CREATED],
            filters: [{suffix: '.docx'}], // optional
        }));
        msWordExtractorFunction.addEventSource(new S3EventSource(this.contentLibraryBucket, {
            events: [EventType.OBJECT_CREATED],
            filters: [{suffix: '.doc'}], // optional
        }));
        this.contentLibraryBucket.grantRead(msWordExtractorFunction);
        processingBucket.grantWrite(msWordExtractorFunction);
    }
}