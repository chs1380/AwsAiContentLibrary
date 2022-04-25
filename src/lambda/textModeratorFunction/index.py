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
from profanity_check import predict, predict_prob


print('Loading function')

task = 'offensive'
MODEL = f"cardiffnlp/twitter-roberta-base-{task}"
tokenizer = AutoTokenizer.from_pretrained(MODEL)
model = AutoModelForSequenceClassification.from_pretrained(MODEL)

threshold = 0.6

sns = boto3.client('sns')


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


def publish_message(key, problem, details):
    source, moderateContent = get_source_file_and_moderate_content(key)
    message = {
        'source': source,
        'moderateContent': moderateContent,
        'problem': problem + " text",
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
        offensiveDetails = {}
        profanityDetails = {}
        if key.endswith('.json'):
            print("PPT:" + key)
            content = Path(file_path).read_text()
            pageToText = json.loads(content)
            for page, text in pageToText.items():
                offensiveScore = get_offensive_score(text)
                profanityScore = predict_prob([text])[0]
                if offensiveScore > threshold:
                    offensiveDetails[page] = offensiveScore
                if profanityScore > threshold:
                    profanityDetails[page] = profanityScore
            if len(offensiveDetails) > 0:
                publish_message(key, 'offensive', offensiveDetails)
            if len(profanityDetails) > 0:
                publish_message(key, 'profanity', profanityDetails)
        elif key.endswith('.txt'):
            print("Text:" + key)
            file = open(file_path, "r", encoding='utf-8')
            lines = file.readlines()
            for line in lines:
                if line:
                    offensiveScore = get_offensive_score(line)
                    profanityScore = predict_prob([line])[0]
                    print(line)
                    if offensiveScore > threshold:
                        publish_message(key, 'offensive', offensiveScore)
                        break
                    if profanityScore > threshold:
                        publish_message(key, 'profanity', offensiveScore)
                        break
        return 'OK'
    except Exception as e:
        print(e)
        print('Error getting object {} from bucket {}. Make sure they exist and your bucket is in the same region as this function.'.format(key, bucket))
        raise e
