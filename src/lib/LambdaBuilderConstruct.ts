import { Bucket, EventType } from "aws-cdk-lib/aws-s3";
import {
  PythonFunction,
  PythonLayerVersion,
} from "@aws-cdk/aws-lambda-python-alpha";
import path from "path";
import { ILayerVersion, Runtime, Tracing } from "aws-cdk-lib/aws-lambda";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import { S3EventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Topic } from "aws-cdk-lib/aws-sns";
import { Construct } from "constructs";

export class LambdaBuilderConstruct extends Construct {
  public readonly processingBucket: Bucket;
  public readonly moderationTopic: Topic;
  public readonly prefix: string;
  public readonly commonLayer: ILayerVersion;
  public readonly contentLibraryBucket: Bucket;
  private readonly scope: Construct;

  constructor(
    scope: Construct,
    id: string,
    prefix: string,
    contentLibraryBucket: Bucket,
    processingBucket: Bucket,
    moderationTopic: Topic
  ) {
    super(scope, id);

    this.scope = scope;
    this.prefix = prefix;
    this.processingBucket = processingBucket;
    this.contentLibraryBucket = contentLibraryBucket;
    this.moderationTopic = moderationTopic;

    this.commonLayer = new PythonLayerVersion(this, "commonLayer", {
      removalPolicy: RemovalPolicy.DESTROY,
      compatibleRuntimes: [Runtime.PYTHON_3_9],
      entry: path.join(__dirname, "..", "..", "lambda", "commonLayer"), // point this to your library's directory
    });
  }

  public extractorFunction(functionName: string, extensions: string[]) {
    return this.getProcessingFunction(
      functionName,
      extensions,
      this.contentLibraryBucket,
      this.processingBucket
    );
  }
  public moderatorFunction(
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

  public getProcessingFunction(
    functionName: string,
    extensions: string[],
    triggerSourceBucket: Bucket,
    resultBucket: Bucket | undefined,
    memorySize: number = 512
  ) {
    const processingFunction = new PythonFunction(this.scope, functionName, {
      entry: path.join(__dirname, "..", "..", "lambda", functionName), // required
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

  public getFunction(functionName: string) {
    return new PythonFunction(this, functionName, {
      entry: path.join(__dirname, "..", "..", "lambda", functionName), // required
      description: this.prefix + functionName,
      runtime: Runtime.PYTHON_3_9, // required
      index: "index.py", // optional, defaults to 'index.py'
      handler: "lambda_handler", // optional, defaults to 'handler'
      layers: [this.commonLayer],
      timeout: Duration.seconds(30),
      memorySize: 512,
      tracing: Tracing.ACTIVE,
    });
  }
}
