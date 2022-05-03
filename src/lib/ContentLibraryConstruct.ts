import { Construct } from "constructs";
import { Bucket, EventType } from "aws-cdk-lib/aws-s3";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { Topic } from "aws-cdk-lib/aws-sns";
import { LambdaDestination } from "aws-cdk-lib/aws-s3-notifications";
import {
  EmailSubscription,
  LambdaSubscription,
} from "aws-cdk-lib/aws-sns-subscriptions";
import { LambdaBuilderConstruct } from "./LambdaBuilderConstruct";
import { ImageModeratorConstruct } from "./ImageModeratorConstruct";
import { TextModeratorConstruct } from "./TextModeratorConstruct";
import { VideoModeratorConstruct } from "./VideoModeratorConstruct";
import { Table, AttributeType, BillingMode } from "aws-cdk-lib/aws-dynamodb";
import { S3EventSource } from "aws-cdk-lib/aws-lambda-event-sources";

export interface ContentLibraryConstructProps {
  prefix: string;
  adminEmail?: string;
}

export class ContentLibraryConstruct extends Construct {
  public readonly contentLibraryBucket: Bucket;
  public readonly moderationFailedBucket: Bucket;
  public readonly moderationResultTable: Table;
  public readonly moderationFailedTopic: Topic;
  private readonly processingBucket: Bucket;
  private readonly prefix: string;
  private readonly moderationTopic: Topic;
  private readonly lambdaBuilderConstruct: LambdaBuilderConstruct;

  constructor(
    scope: Construct,
    id: string,
    props: ContentLibraryConstructProps = { prefix: "" }
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

    this.moderationFailedTopic = new Topic(this, "moderationFailedTopic");
    this.moderationFailedBucket = new Bucket(this, "moderationFailedBucket", {
      removalPolicy: RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          abortIncompleteMultipartUploadAfter: Duration.days(5),
        },
      ],
    });

    this.moderationTopic = new Topic(this, "moderationTopic");

    if (props.adminEmail) {
      this.moderationFailedTopic.addSubscription(
        new EmailSubscription(props.adminEmail!)
      );
    }
    this.prefix = props.prefix;
    this.lambdaBuilderConstruct = new LambdaBuilderConstruct(
      this,
      "lambdaBuilderConstruct",
      this.prefix,
      this.contentLibraryBucket,
      this.processingBucket,
      this.moderationTopic
    );
    this.lambdaBuilderConstruct.extractorFunction("msWordExtractorFunction", [
      "docx",
      "docm",
    ]);
    this.lambdaBuilderConstruct.extractorFunction(
      "msPowerPointExtractorFunction",
      ["pptx", "pptm"]
    );
    this.lambdaBuilderConstruct.extractorFunction("pdfExtractorFunction", [
      "pdf",
    ]);

    const copyObjectFunction =
      this.lambdaBuilderConstruct.getProcessingFunction(
        "copyObjectFunction",
        [],
        this.contentLibraryBucket,
        this.processingBucket
      );

    copyObjectFunction.addEventSource(
      new S3EventSource(this.contentLibraryBucket, {
        events: [EventType.OBJECT_CREATED],
      })
    );

    new ImageModeratorConstruct(this, "imageModerationConstruct", {
      lambdaBuilderConstruct: this.lambdaBuilderConstruct,
    });
    new TextModeratorConstruct(this, "textModeratorConstruct", {
      lambdaBuilderConstruct: this.lambdaBuilderConstruct,
    });
    new VideoModeratorConstruct(this, "videoModeratorConstruct", {
      lambdaBuilderConstruct: this.lambdaBuilderConstruct,
    });

    this.moderationResultTable = new Table(this, "moderationResultTable", {
      partitionKey: { name: "key", type: AttributeType.STRING },
      sortKey: { name: "subKey", type: AttributeType.STRING },
      billingMode: BillingMode.PAY_PER_REQUEST,
    });
    this.buildModerationFailedResources();
  }

  private buildModerationFailedResources() {

    const moderationFailedFunction = this.lambdaBuilderConstruct.getFunction(
        "moderationFailedFunction"
    );
    moderationFailedFunction.addEnvironment(
        "contentLibraryBucket",
        this.contentLibraryBucket.bucketName
    );
    moderationFailedFunction.addEnvironment(
        "moderationFailedBucket",
        this.moderationFailedBucket.bucketName
    );
    moderationFailedFunction.addEnvironment(
        "moderationResultTableName",
        this.moderationResultTable.tableName
    );
    this.moderationTopic.addSubscription(
        new LambdaSubscription(moderationFailedFunction)
    );
    this.moderationFailedBucket.grantWrite(moderationFailedFunction);
    this.contentLibraryBucket.grantReadWrite(moderationFailedFunction);
    this.moderationResultTable.grantFullAccess(moderationFailedFunction);

    const notifyModerationResultFunction =
        this.lambdaBuilderConstruct.getFunction("notifyModerationResultFunction");
    notifyModerationResultFunction.addEnvironment(
        "moderationFailedTopicArn",
        this.moderationFailedTopic.topicArn
    );
    this.moderationFailedBucket.grantPutAcl(notifyModerationResultFunction);
    this.moderationFailedBucket.grantRead(notifyModerationResultFunction);
    this.moderationFailedTopic.grantPublish(notifyModerationResultFunction);
    this.moderationFailedBucket.addEventNotification(
        EventType.OBJECT_CREATED_COPY,
        new LambdaDestination(notifyModerationResultFunction)
    );
  }
}
