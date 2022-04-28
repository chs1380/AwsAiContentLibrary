import json
from common import *
import boto3
import os

print('Loading function')

rekognition = boto3.client('rekognition')

sns = boto3.client('sns')


def moderate_video(key, jobId):
    source, moderateContent = get_source_file_and_moderate_content(key)
    message = {
        'source': source,
        'moderateContent': moderateContent,
        'problem': 'Video',
        'details': {'JobId': jobId}
    }
    response = sns.publish(
        TargetArn=os.environ['moderationTopic'],
        Message=json.dumps({'default': json.dumps(message)}),
        MessageStructure='json'
    )
    print(response)


def hasAnyUnsafeContent(startJobId):
    maxResults = 10
    paginationToken = ''
    finished = False

    while finished == False:
        response = rekognition.get_content_moderation(JobId=startJobId,
                                                      MaxResults=maxResults,
                                                      NextToken=paginationToken)
        if len(response['ModerationLabels']) > 0:
            return True

        if 'NextToken' in response:
            paginationToken = response['NextToken']
        else:
            finished = True
    return False


def lambda_handler(event, context):
    #print("Received event: " + json.dumps(event, indent=2))
    message = event['Records'][0]['Sns']['Message']
    print("From SNS: " + message)

    data = json.loads(message)
    jobId = data['JobId']
    key = data['S3ObjectName']
    if hasAnyUnsafeContent(jobId):
        moderate_video(key, jobId)

    return message
