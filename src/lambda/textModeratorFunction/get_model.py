from transformers import AutoModelForSequenceClassification
from transformers import AutoTokenizer
import numpy as np
from scipy.special import softmax
import csv
import urllib.request


def get_model(model):
    task = 'offensive'
    MODEL = f"cardiffnlp/twitter-roberta-base-{task}"
    tokenizer = AutoTokenizer.from_pretrained(MODEL)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL)
    tokenizer.save_pretrained(MODEL)
    model.save_pretrained(MODEL)


get_model('all-MiniLM-L6-v2')
