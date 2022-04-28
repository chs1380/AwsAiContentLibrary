import json
from common import *
import boto3
import os

print('Loading function')
s3 = boto3.client('s3')


def isObjectExist(contentLibraryBucket, key):
    results = s3.list_objects(Bucket=contentLibraryBucket, Prefix=key)
    return 'Contents' in results


def lambda_handler(event, context):
    message = event['Records'][0]['Sns']['Message']
    print("From SNS: " + message)
    data = json.loads(message)

    key = data['source']

    contentLibraryBucket = os.environ['contentLibraryBucket']
    moderationFailedBucket = os.environ['moderationFailedBucket']

    if isObjectExist(contentLibraryBucket, key):
        s3.copy_object(Bucket=moderationFailedBucket,
                       CopySource={'Bucket': contentLibraryBucket, 'Key': key}, Key=key)
        s3.delete_object(Bucket=contentLibraryBucket, Key=key)
        print("Moved source to moderationFailedBucket.")

    return message
