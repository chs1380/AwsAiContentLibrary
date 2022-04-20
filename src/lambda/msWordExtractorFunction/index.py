import json
import urllib.parse
import boto3
import botocore
import os
import shutil
import glob
import zipfile
from pathlib import Path
import pypandoc

print('Loading function')

s3 = boto3.client('s3')

def clean_tmp():
    folder = '/tmp/'
    for filename in os.listdir(folder):
        file_path = os.path.join(folder, filename)
        try:
            if os.path.isfile(file_path) or os.path.islink(file_path):
                os.unlink(file_path)
            elif os.path.isdir(file_path):
                shutil.rmtree(file_path)
        except Exception as e:
            print('Failed to delete %s. Reason: %s' % (file_path, e))

def save_word_file(bucket,key):
    try:
        word_file_path = os.path.join("/tmp/", key)
        os.makedirs(os.path.dirname(word_file_path), exist_ok=True)
        s3.download_file(Bucket=bucket, Key=key, Filename=word_file_path)
        return word_file_path
    except botocore.exceptions.ClientError as e:
        if e.response['Error']['Code'] == "404":
            print("The object does not exist.")
        else:
            raise

def extract_media(word_file_path):
    archive = zipfile.ZipFile(word_file_path)
    for file in archive.filelist:
        if file.filename.startswith('word/media/'):
            filename, file_extension = os.path.splitext(word_file_path)
            file_extension = file_extension[1:]
            extract_media_file_dir=os.path.join(filename,file_extension)
            os.makedirs(os.path.dirname(extract_media_file_dir), exist_ok=True)
            print(extract_media_file_dir)
            archive.extract(file, path=extract_media_file_dir)

def extract_text(word_file_path):
    filename, file_extension = os.path.splitext(word_file_path)
    text = docx2txt.process(word_file_path)
    outputfile=os.path.join(os.path.dirname(word_file_path), filename + ".txt")
    print(text)

def copy_tmp_to_processing_bucket():
    print('copy_tmp_to_processing_bucket')
    for path in Path("/tmp/").rglob('*.*'):
        print(path)
        processingBucket = os.environ['processingBucket']
        s3.upload_file(
            Filename=str(path),
            Bucket=processingBucket,
            Key=str(path)[len("/tmp/"):],
        )

def lambda_handler(event, context):
    clean_tmp()
    # Get the object from the event and show its content type
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = urllib.parse.unquote_plus(event['Records'][0]['s3']['object']['key'], encoding='utf-8')
    try:
        word_file_path = save_word_file(bucket,key)
        extract_media(word_file_path)
        extract_text(word_file_path)
        copy_tmp_to_processing_bucket();
        return response['ContentType']
    except Exception as e:
        print(e)
        print('Error getting object {} from bucket {}. Make sure they exist and your bucket is in the same region as this function.'.format(key, bucket))
        raise e
