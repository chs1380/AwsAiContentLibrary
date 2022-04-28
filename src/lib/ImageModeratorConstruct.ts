import {Construct} from "constructs";
import {LambdaBuilderConstruct} from "./LambdaBuilderConstruct";
import {Policy, PolicyStatement} from "aws-cdk-lib/aws-iam";

export interface ImageModerationConstructProps {
    lambdaBuilderConstruct: LambdaBuilderConstruct;
}


export class ImageModeratorConstruct extends Construct {
    constructor(
        scope: Construct,
        id: string,
        props: ImageModerationConstructProps
    ) {
        super(scope, id);
        const imageModeratorFunction = props.lambdaBuilderConstruct.moderatorFunction(
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
    }
}
