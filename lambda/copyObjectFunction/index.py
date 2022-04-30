import json
from common import *
import boto3
import os

print('Loading function')
s3 = boto3.client('s3')


def lambda_handler(event, context):
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = urllib.parse.unquote_plus(
        event['Records'][0]['s3']['object']['key'], encoding='utf-8')
    contentLibraryBucket = bucket
    processingBucket = os.environ['processingBucket']

    return s3.copy_object(Bucket=processingBucket,
                          CopySource={'Bucket': contentLibraryBucket, 'Key': key}, Key=key)
