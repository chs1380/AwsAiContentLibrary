import urllib.parse
import os
from transformers import AutoModelForSequenceClassification
from transformers import AutoTokenizer
import numpy as np
from scipy.special import softmax
import csv
import urllib.request
from common import *
from pathlib import Path
import json

print('Loading function')

task = 'offensive'
MODEL = f"cardiffnlp/twitter-roberta-base-{task}"
tokenizer = AutoTokenizer.from_pretrained(MODEL)
model = AutoModelForSequenceClassification.from_pretrained(MODEL)

threshold = 0.6

sns = boto3.client('sns')

# Preprocess text (username and link placeholders)


def preprocess(text):
    new_text = []
    for t in text.split(" "):
        new_text.append(t)
    return " ".join(new_text)


def get_offensive_score(text):
    text = preprocess(text)
    encoded_input = tokenizer(text, return_tensors='pt')
    output = model(**encoded_input)
    scores = output[0][0].detach().numpy()
    scores = softmax(scores)
    ranking = np.argsort(scores)
    ranking = ranking[::-1]
    s = scores[ranking[1]]
    return np.round(float(s), 4)


def publish_offensive_message(key, details):
    message = {
        'source': get_source_file(key),
        'problem': 'Text moderation failed!',
        'details': details
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
        details = {}
        if key.endswith('.json'):
            content = Path(file_path).read_text()
            pageToText = json.loads(content)
            for page, text in pageToText.items():
                score = get_offensive_score(text)
                if score > threshold:
                    details[page] = score
            if len(details) > 0:
                publish_offensive_message(key, details)
        elif key.endswith('.txt'):
            wordText = open(file_path, "r")
            for line in text.wordText():
                if not line:
                    score = get_offensive_score(line)
                    publish_offensive_message(key, score)
                    break
        return 'OK'
    except Exception as e:
        print(e)
        print('Error getting object {} from bucket {}. Make sure they exist and your bucket is in the same region as this function.'.format(key, bucket))
        raise e
