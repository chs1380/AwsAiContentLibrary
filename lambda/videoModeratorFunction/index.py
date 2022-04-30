import urllib.parse
import os
from common import *
import boto3

print('Loading function')


rekognition = boto3.client('rekognition')
transcribe = boto3.client('transcribe')


def lambda_handler(event, context):
    # Get the object from the event and show its content type
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = urllib.parse.unquote_plus(
        event['Records'][0]['s3']['object']['key'], encoding='utf-8')
    try:
        response = rekognition.start_content_moderation(
            Video={
                'S3Object': {
                    'Bucket': bucket,
                    'Name': key
                }
            },
            NotificationChannel={
                'SNSTopicArn': os.environ['videoContentModerationTopic'],
                'RoleArn': os.environ['rekognitionServiceRole']
            },
            JobTag=context.aws_request_id
        )
        print(response)

        output_key = get_moderate_content_key(key, "json")
        safe_filename = output_key.replace('@', "(_!AT!_)")
        safe_filename = safe_filename.replace(' ', "(_!SPACE!_)")
        job_args = {
            'TranscriptionJobName': context.aws_request_id,
            'Media': {'MediaFileUri':  f's3://{bucket}/{key}'},
            'MediaFormat': file_extension.lower()[1:],
            'LanguageCode': 'en-US',
            'OutputBucketName':  bucket,
            'OutputKey': safe_filename+".json",
        }
        response = transcribe.start_transcription_job(**job_args)
        print(response)

        return 'OK'
    except Exception as e:
        print(e)
        print('Error getting object {} from bucket {}. Make sure they exist and your bucket is in the same region as this function.'.format(key, bucket))
        raise e
