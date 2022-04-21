import json
import urllib.parse
import boto3
import botocore
import os
import shutil
import glob
import zipfile
from pathlib import Path

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

def save_file(bucket,key):
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

def extract_media(file_path, prefix):
    archive = zipfile.ZipFile(file_path)
    for file in archive.filelist:
        if file.filename.startswith(prefix):
            filename, file_extension = os.path.splitext(file_path)
            file_extension = file_extension[1:]
            extract_media_file_dir=os.path.join(filename,file_extension)
            os.makedirs(os.path.dirname(extract_media_file_dir), exist_ok=True)
            archive.extract(file, path=extract_media_file_dir)


def copy_tmp_to_processing_bucket():
    print('copy_tmp_to_processing_bucket')
    processingBucket = os.environ['processingBucket']
    for path in Path("/tmp/").rglob('*.*'):
        print(path)
        if os.path.isfile(path):
            s3.upload_file(
                Filename=str(path),
                Bucket=processingBucket,
                Key=str(path)[len("/tmp/"):],
            )