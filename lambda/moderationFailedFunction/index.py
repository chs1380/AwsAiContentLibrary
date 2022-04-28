import json
from common import *
import boto3
import os

print('Loading function')
s3 = boto3.client('s3')
dynamodb = boto3.client('dynamodb')


def isObjectExist(contentLibraryBucket, key):
    results = s3.list_objects(Bucket=contentLibraryBucket, Prefix=key)
    return 'Contents' in results


def lambda_handler(event, context):
    message = event['Records'][0]['Sns']['Message']
    print("From SNS: " + message)
    data = json.loads(message)

    key = data['source']
    subKey = data['problem'] + "-" + data['moderateContent']
    details = data['details']

    contentLibraryBucket = os.environ['contentLibraryBucket']
    moderationFailedBucket = os.environ['moderationFailedBucket']

    if isObjectExist(contentLibraryBucket, key):
        s3.copy_object(Bucket=moderationFailedBucket,
                       CopySource={'Bucket': contentLibraryBucket, 'Key': key}, Key=key)
        s3.delete_object(Bucket=contentLibraryBucket, Key=key)
        print("Moved source to moderationFailedBucket.")
    dynamodb.put_item(TableName=os.environ['moderationResultTableName'],
                      Item={'key': {'S': key}, 'subKey': {'S': subKey}, 'details': {'S': details}})
    return message
