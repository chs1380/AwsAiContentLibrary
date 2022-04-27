import { Construct } from "constructs";
import { Bucket, EventType } from "aws-cdk-lib/aws-s3";
import {
  DockerImageCode,
  DockerImageFunction,
  Runtime,
  Tracing,
} from "aws-cdk-lib/aws-lambda";
import {
  PythonFunction,
  PythonLayerVersion,
} from "@aws-cdk/aws-lambda-python-alpha";
import * as path from "path";
import { Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import { S3EventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import {
  Policy,
  PolicyStatement,
  ServicePrincipal,
  Role,
} from "aws-cdk-lib/aws-iam";
import { Topic } from "aws-cdk-lib/aws-sns";
import {
  EmailSubscription,
  LambdaSubscription,
} from "aws-cdk-lib/aws-sns-subscriptions";
import { HuggingFaceSagemakerServerlessInferenceConstruct } from "./HuggingFaceSagemakerServerlessInferenceConstruct";

export interface ContentLibraryConstructProps {
  prefix: string;
  adminEmail?: string;
}

export class ContentLibraryConstruct extends Construct {
  public readonly contentLibraryBucket: Bucket;
  public readonly moderationFailedBucket: Bucket;
  private readonly processingBucket: Bucket;
  private readonly commonLayer: PythonLayerVersion;
  private readonly prefix: string;
  private readonly moderationTopic: Topic;
  private readonly videoContentModerationTopic: Topic;

  private readonly huggingFaceodelEndpointName: string;

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

    const huggingFaceSagemakerServerlessInferenceConstruct =
      new HuggingFaceSagemakerServerlessInferenceConstruct(
        this,
        "huggingFaceSagemakerServerlessInferenceConstruct",
        {
          hfModelId: "cardiffnlp/twitter-roberta-base-offensive",
          hfTask: "text-classification",
        }
      );
    this.huggingFaceodelEndpointName =
      huggingFaceSagemakerServerlessInferenceConstruct.endpointName;

    this.moderationFailedBucket = new Bucket(this, "moderationFailedBucket", {
      removalPolicy: RemovalPolicy.DESTROY,
      lifecycleRules: [
        {
          abortIncompleteMultipartUploadAfter: Duration.days(5),
        },
      ],
    });
    this.moderationTopic = new Topic(this, "moderationTopic");

    this.videoContentModerationTopic = new Topic(
      this,
      "videoContentModerationTopic"
    );

    if (props.adminEmail)
      this.moderationTopic.addSubscription(
        new EmailSubscription(props.adminEmail!)
      );

    this.prefix = props.prefix;

    this.commonLayer = new PythonLayerVersion(this, "commonLayer", {
      removalPolicy: RemovalPolicy.DESTROY,
      compatibleRuntimes: [Runtime.PYTHON_3_9],
      entry: path.join(
        __dirname,
        "..",
        "..",
        "assets",
        "lambda",
        "commonLayer"
      ), // point this to your library's directory
    });

    this.extractorFunction("msWordExtractorFunction", ["docx", "docm"]);
    this.extractorFunction("msPowerPointExtractorFunction", ["pptx", "pptm"]);
    const imageModeratorFunction = this.moderatorFunction(
      "imageModeratorFunction",
      ["jpeg", "jpg", "png"]
    );
    imageModeratorFunction.role?.attachInlinePolicy(
      new Policy(this, "imageModeratorFunctionPolicy", {
        statements: [
          new PolicyStatement({
            actions: [
              "rekognition:DetectText",
              "rekognition:DetectModerationLabels",
            ],
            resources: ["*"],
          }),
        ],
      })
    );
    this.buildTextModeratorFunction();
    this.buildVideoModerationFunctions();
    this.buildModerationFailedFunction();
  }

  private buildModerationFailedFunction() {
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
        layers: [this.commonLayer],
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

  private buildVideoModerationFunctions() {
    const rekognitionServiceRole = new Role(this, "rekognitionServiceRole", {
      assumedBy: new ServicePrincipal("rekognition.amazonaws.com"),
    });
    this.videoContentModerationTopic.grantPublish(rekognitionServiceRole);

    const videoModeratorFunction = this.moderatorFunction(
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
                "transcribe:OutputBucketName": this.processingBucket.bucketName,
              },
            },
          }),
        ],
      })
    );
    videoModeratorFunction.addEnvironment(
      "videoContentModerationTopic",
      this.videoContentModerationTopic.topicArn
    );
    videoModeratorFunction.addEnvironment(
      "rekognitionServiceRole",
      rekognitionServiceRole.roleArn
    );

    const videoModeratorCallbackFunction = this.moderatorFunction(
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
    this.videoContentModerationTopic.addSubscription(
      new LambdaSubscription(videoModeratorCallbackFunction)
    );
  }

  private buildTextModeratorFunction() {
    const textModeratorFunction = new DockerImageFunction(
      this,
      "textModeratorFunction",
      {
        code: DockerImageCode.fromImageAsset(
          path.join(
            __dirname,
            "..",
            "..",
            "assets",
            "lambda",
            "textModeratorFunction"
          ),
          {
            cmd: ["index.lambda_handler"],
          }
        ),
        memorySize: 8096,
        timeout: Duration.minutes(10),
        environment: {
          processingBucket: this.processingBucket.bucketName,
          moderationTopic: this.moderationTopic.topicArn,
        },
        tracing: Tracing.ACTIVE,
      }
    );
    this.contentLibraryBucket.grantReadWrite(textModeratorFunction);
    this.processingBucket.grantReadWrite(textModeratorFunction);
    ["json", "txt"].map((ext) =>
      textModeratorFunction.addEventSource(
        new S3EventSource(this.processingBucket, {
          events: [EventType.OBJECT_CREATED],
          filters: [{ suffix: "." + ext }], // optional
        })
      )
    );
    this.moderationTopic.grantPublish(textModeratorFunction);

    const offensiveTextModeratorFunction = this.moderatorFunction(
      "offensiveTextModeratorFunction",
      []
    );
    offensiveTextModeratorFunction.addEnvironment(
      "huggingFaceodelEndpointName",
      this.huggingFaceodelEndpointName
    );
    this.moderationTopic.grantPublish(offensiveTextModeratorFunction);
    offensiveTextModeratorFunction.role?.attachInlinePolicy(
      new Policy(this, "offensiveTextModeratorFunctionPolicy", {
        statements: [
          new PolicyStatement({
            actions: ["sagemaker:InvokeEndpoint"],
            resources: [
              `arn:aws:sagemaker:${Stack.of(this).region}:${
                Stack.of(this).account
              }:endpoint/${this.huggingFaceodelEndpointName}`,
            ],
          }),
        ],
      })
    );
  }

  private extractorFunction(functionName: string, extensions: string[]) {
    return this.getProcessingFunction(
      functionName,
      extensions,
      this.contentLibraryBucket,
      this.processingBucket
    );
  }

  private moderatorFunction(
    functionName: string,
    extensions: string[],
    memorySize: number = 512
  ) {
    const f = this.getProcessingFunction(
      functionName,
      extensions,
      this.processingBucket,
      undefined,
      memorySize
    );
    this.processingBucket.grantReadWrite(f);
    this.moderationTopic.grantPublish(f);
    return f;
  }

  private getProcessingFunction(
    functionName: string,
    extensions: string[],
    triggerSourceBucket: Bucket,
    resultBucket: Bucket | undefined,
    memorySize: number = 512
  ) {
    const processingFunction = new PythonFunction(this, functionName, {
      entry: path.join(__dirname, "..", "..", "assets", "lambda", functionName), // required
      description: this.prefix + functionName,
      runtime: Runtime.PYTHON_3_9, // required
      index: "index.py", // optional, defaults to 'index.py'
      handler: "lambda_handler", // optional, defaults to 'handler'
      layers: [this.commonLayer],
      environment: {
        processingBucket: this.processingBucket.bucketName,
        moderationTopic: this.moderationTopic.topicArn,
      },
      timeout: Duration.minutes(5),
      memorySize,
      tracing: Tracing.ACTIVE,
    });
    extensions.map((ext) =>
      processingFunction.addEventSource(
        new S3EventSource(triggerSourceBucket, {
          events: [EventType.OBJECT_CREATED],
          filters: [{ suffix: "." + ext }], // optional
        })
      )
    );
    triggerSourceBucket.grantReadWrite(processingFunction);
    resultBucket?.grantReadWrite(processingFunction);
    return processingFunction;
  }
}
