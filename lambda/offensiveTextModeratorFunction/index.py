import urllib.parse
import os
from common import *
import sagemaker
import boto3
from pathlib import Path

from sagemaker.huggingface.model import HuggingFaceModel, HuggingFacePredictor
from sagemaker.serverless import ServerlessInferenceConfig

print('Loading function')
sess = sagemaker.Session()

print(f"sagemaker role arn: {role}")
print(f"sagemaker session region: {sess.boto_region_name}")


def inference(text):
    predictor = HuggingFacePredictor(
        endpoint_name=os.environ['huggingFaceodelEndpointName'], sagemaker_session=sess)

    data = {
        "inputs": text,
        "parameters": {
            'truncation': True,
            'max_length': 256,
            'padding': True,
        }
    }

    res = predictor.predict(data=data)
    print(res)


def lambda_handler(event, context):
    clean_tmp()
    # Get the object from the event and show its content type
    # bucket = event['Records'][0]['s3']['bucket']['name']
    # key = urllib.parse.unquote_plus(
    #     event['Records'][0]['s3']['object']['key'], encoding='utf-8')
    try:
        # file_path = save_file(bucket, key)
        # text = Path(file_path).read_text()
        inference("Fuck you")
        # copy_tmp_to_processing_bucket()
        return 'OK'
    except Exception as e:
        print(e)
        # print('Error getting object {} from bucket {}. Make sure they exist and your bucket is in the same region as this function.'.format(key, bucket))
        raise e
