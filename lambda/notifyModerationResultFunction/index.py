import urllib.parse
import os
import json
from common import *
import boto3
from botocore.exceptions import ClientError


print('Loading function')

s3 = boto3.client('s3')
sns = boto3.client('sns')


def create_presigned_url(bucket_name, object_name, expiration=3600):
    try:
        response = s3.generate_presigned_url('get_object',
                                             Params={'Bucket': bucket_name,
                                                     'Key': object_name},
                                             ExpiresIn=expiration)
    except ClientError as e:
        print(e)
        return None
    # The response contains the presigned URL
    return response


def lambda_handler(event, context):
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = urllib.parse.unquote_plus(
        event['Records'][0]['s3']['object']['key'], encoding='utf-8')

    url = create_presigned_url(bucket, key)

    response = sns.publish(
        TargetArn=os.environ['moderationFailedTopicArn'],
        Subject='Moderation Failure Alert',
        Message=json.dumps(
            {'default': json.dumps({'bucket': bucket, 'key': key, 'url': url})}),
        MessageStructure='json'
    )
    print(response)
