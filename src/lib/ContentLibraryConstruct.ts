import {Construct} from "constructs";
import {Bucket} from "aws-cdk-lib/aws-s3";
import {
    Runtime,
    Tracing,
} from "aws-cdk-lib/aws-lambda";
import {
    PythonFunction,
} from "@aws-cdk/aws-lambda-python-alpha";
import * as path from "path";
import {Duration, RemovalPolicy} from "aws-cdk-lib";
import {Topic} from "aws-cdk-lib/aws-sns";
import {
    EmailSubscription,
    LambdaSubscription,
} from "aws-cdk-lib/aws-sns-subscriptions";
import {LambdaBuilderConstruct} from "./LambdaBuilderConstruct";
import {ImageModeratorConstruct} from "./ImageModeratorConstruct";
import {TextModeratorConstruct} from "./TextModeratorConstruct";
import {VideoModeratorConstruct} from "./VideoModeratorConstruct";

export interface ContentLibraryConstructProps {
    prefix: string;
    adminEmail?: string;
}

export class ContentLibraryConstruct extends Construct {
    public readonly contentLibraryBucket: Bucket;
    public readonly moderationFailedBucket: Bucket;
    private readonly processingBucket: Bucket;
    private readonly prefix: string;
    private readonly moderationTopic: Topic;
    private readonly lambdaBuilderConstruct: LambdaBuilderConstruct;

    constructor(
        scope: Construct,
        id: string,
        props: ContentLibraryConstructProps = {prefix: ""}
    ) {
        super(scope, id);
        this.contentLibraryBucket = new Bucket(this, "contentLibraryBucket", {
            removalPolicy: RemovalPolicy.DESTROY,
            lifecycleRules: [
                {
                    abortIncompleteMultipartUploadAfter: Duration.days(5),
                },
            ],
        });
        this.processingBucket = new Bucket(this, "processingBucket", {
            removalPolicy: RemovalPolicy.DESTROY,
            lifecycleRules: [
                {
                    abortIncompleteMultipartUploadAfter: Duration.days(5),
                    expiration: Duration.days(7),
                },
            ],
        });

        this.moderationFailedBucket = new Bucket(this, "moderationFailedBucket", {
            removalPolicy: RemovalPolicy.DESTROY,
            lifecycleRules: [
                {
                    abortIncompleteMultipartUploadAfter: Duration.days(5),
                },
            ],
        });
        this.moderationTopic = new Topic(this, "moderationTopic");

        if (props.adminEmail)
            this.moderationTopic.addSubscription(
                new EmailSubscription(props.adminEmail!)
            );

        this.prefix = props.prefix;
        this.lambdaBuilderConstruct = new LambdaBuilderConstruct(this, "lambdaBuilderConstruct", this.prefix, this.contentLibraryBucket, this.processingBucket, this.moderationTopic);
        this.lambdaBuilderConstruct.extractorFunction("msWordExtractorFunction", ["docx", "docm"]);
        this.lambdaBuilderConstruct.extractorFunction("msPowerPointExtractorFunction", ["pptx", "pptm"]);

        new ImageModeratorConstruct(this, 'imageModerationConstruct', {lambdaBuilderConstruct: this.lambdaBuilderConstruct});
        new TextModeratorConstruct(this, "TextModeratorConstruct", {lambdaBuilderConstruct: this.lambdaBuilderConstruct});
        new VideoModeratorConstruct(this,'VideoModeratorConstruct',{lambdaBuilderConstruct: this.lambdaBuilderConstruct});

        const moderationFailedFunction = new PythonFunction(
            this,
            "moderationFailedFunction",
            {
                entry: path.join(
                    __dirname,
                    "..",
                    "..",
                    "assets",
                    "lambda",
                    "moderationFailedFunction"
                ), // required
                description: this.prefix + "moderationFailedFunction",
                runtime: Runtime.PYTHON_3_9, // required
                index: "index.py", // optional, defaults to 'index.py'
                handler: "lambda_handler", // optional, defaults to 'handler'
                layers: [this.lambdaBuilderConstruct.commonLayer],
                environment: {
                    contentLibraryBucket: this.contentLibraryBucket.bucketName,
                    moderationFailedBucket: this.moderationFailedBucket.bucketName,
                },
                timeout: Duration.minutes(5),
                memorySize: 512,
                tracing: Tracing.ACTIVE,
            }
        );
        this.moderationTopic.addSubscription(
            new LambdaSubscription(moderationFailedFunction)
        );
        this.moderationFailedBucket.grantWrite(moderationFailedFunction);
        this.contentLibraryBucket.grantReadWrite(moderationFailedFunction);
    }
}
