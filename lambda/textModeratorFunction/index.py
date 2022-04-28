import urllib.parse
import os
import numpy as np
from scipy.special import softmax
import csv
import urllib.request
from common import *
from pathlib import Path
import json
from profanity_check import predict, predict_prob
import sagemaker

from sagemaker.huggingface.model import HuggingFaceModel, HuggingFacePredictor
from sagemaker.serverless import ServerlessInferenceConfig

print('Loading function')


sess = sagemaker.Session()

threshold = 0.6

sns = boto3.client('sns')


def preprocess(text):
    new_text = []
    for t in text.split(" "):
        new_text.append(t)
    return " ".join(new_text)


def get_offensive_score(text):

    predictor = HuggingFacePredictor(
        endpoint_name=os.environ['huggingFaceModelEndpointName'], sagemaker_session=sess)
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

    if res[0]['label'] == 'LABEL_1':
        print(type(res[0]['score']))
        return res[0]['score']
    else:
        return 0


def publish_message(key, problem, details):
    source, moderateContent = get_source_file_and_moderate_content(key)
    message = {
        'source': source,
        'moderateContent': moderateContent,
        'problem': problem + "Text",
        'details': json.dumps(details)
    }
    sns.publish(
        TargetArn=os.environ['moderationTopic'],
        Message=json.dumps({'default': json.dumps(message)}),
        MessageStructure='json'
    )


def handle_text(key, file_path):
    file = open(file_path, "r", encoding='utf-8')
    lines = file.readlines()
    for line in lines:
        if line:
            offensiveScore = get_offensive_score(line)
            profanityScore = predict_prob([line])[0]
            print(line)
            if offensiveScore > threshold:
                details = {'score': offensiveScore, 'text': line}
                publish_message(key, 'Offensive', details)
                break
            if profanityScore > threshold:
                details = {'score': profanityScore, 'text': line}
                publish_message(key, 'Profanity', details)
                break


def handle_json(key, file_path):
    offensiveDetails = {}
    profanityDetails = {}
    text = Path(file_path).read_text()
    content = json.loads(text)

    if 'results' in content and 'transcripts' in content['results']:
        transcript = content['results']['transcripts'][0]['transcript']
        offensiveScore = get_offensive_score(transcript)
        profanityScore = predict_prob([transcript])[0]
        if offensiveScore > threshold:
            publish_message(key, 'Offensive', offensiveScore)
        if profanityScore > threshold:
            publish_message(key, 'Profanity', profanityScore)
    else:
        pageToText = content
        for page, text in pageToText.items():
            offensiveScore = get_offensive_score(text)
            profanityScore = predict_prob([text])[0]
            if offensiveScore > threshold:
                offensiveDetails[page] = offensiveScore
            if profanityScore > threshold:
                profanityDetails[page] = profanityScore
        if len(offensiveDetails) > 0:
            publish_message(key, 'Offensive', offensiveDetails)
        if len(profanityDetails) > 0:
            publish_message(key, 'Profanity', profanityDetails)


def lambda_handler(event, context):
    clean_tmp()
    # Get the object from the event and show its content type
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = urllib.parse.unquote_plus(
        event['Records'][0]['s3']['object']['key'], encoding='utf-8')
    try:
        file_path = save_file(bucket, key)

        if key.endswith('.json'):
            print("PPT:" + key)
            handle_json(key, file_path)
        elif key.endswith('.txt'):
            print("Text:" + key)
            handle_text(key, file_path)

        return 'OK'
    except Exception as e:
        print(e)
        raise e
