import urllib.parse
import os
import docx2txt
from common import *

print('Loading function')

def extract_text(word_file_path):
    #Refernce: https://github.com/ankushshah89/python-docx2txt
    text = docx2txt.process(word_file_path)
    filename, file_extension = os.path.splitext(word_file_path)
    output_file=os.path.join(os.path.dirname(word_file_path), filename + ".txt")
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(text)

def lambda_handler(event, context):
    clean_tmp()
    # Get the object from the event and show its content type
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = urllib.parse.unquote_plus(event['Records'][0]['s3']['object']['key'], encoding='utf-8')
    try:
        word_file_path = save_file(bucket,key)
        extract_media(word_file_path,'word/media/')
        extract_text(word_file_path)
        copy_tmp_to_processing_bucket()
        return 'OK'
    except Exception as e:
        print(e)
        print('Error getting object {} from bucket {}. Make sure they exist and your bucket is in the same region as this function.'.format(key, bucket))
        raise e
