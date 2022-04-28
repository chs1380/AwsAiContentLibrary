import urllib.parse
import os
from common import *
import boto3

print('Loading function')
rekognition = boto3.client('rekognition')
s3 = boto3.client('s3')
sns = boto3.client('sns')


def extract_text(bucket, key, file_path):
    response = rekognition.detect_text(
        Image={'S3Object': {'Bucket': bucket, 'Name': key}})
    lines = []
    words = []
    for text in response['TextDetections']:
        if text['Type'] == 'LINE':
            lines.append(text['DetectedText'])
        elif text['Type'] == 'WORD':
            words.append(text['DetectedText'])
    texts = lines + words
    filePathName, file_extension = os.path.splitext(key)
    output_key = filePathName + ".txt"
    print("\n".join(texts))
    print(output_key)
    text = "\n".join(texts)
    s3.put_object(
        Body=text, Bucket=os.environ['processingBucket'], Key=output_key)


def moderate_image(bucket, key):
    response = rekognition.detect_moderation_labels(
        Image={'S3Object': {'Bucket': bucket, 'Name': key}})
    if len(response['ModerationLabels']) > 0:
        source, moderateContent = get_source_file_and_moderate_content(key)
        message = {
            'source': source,
            'moderateContent': moderateContent,
            'problem': 'Image',
            'details': json.dumps(response['ModerationLabels'])
        }
        response = sns.publish(
            TargetArn=os.environ['moderationTopic'],
            Message=json.dumps({'default': json.dumps(message)}),
            MessageStructure='json'
        )


def lambda_handler(event, context):
    clean_tmp()
    # Get the object from the event and show its content type
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = urllib.parse.unquote_plus(
        event['Records'][0]['s3']['object']['key'], encoding='utf-8')
    try:
        file_path = save_file(bucket, key)
        extract_text(bucket, key, file_path)
        moderate_image(bucket, key)
        # copy_tmp_to_processing_bucket()
        return 'OK'
    except Exception as e:
        print(e)
        print('Error getting object {} from bucket {}. Make sure they exist and your bucket is in the same region as this function.'.format(key, bucket))
        raise e
