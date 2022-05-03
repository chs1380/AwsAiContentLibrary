#!/bin/sh
contentLibraryBucket=$(cat ../output.json | jq -r '."AwsAiContentLibrary-dev1"'.contentLibraryBucket)
aws s3 cp test.docx s3://$contentLibraryBucket/cywong@vtc.edu.hk/test.docx
aws s3 cp test.pptx s3://$contentLibraryBucket/cywong@vtc.edu.hk/test.pptx
aws s3 cp test.pdf s3://$contentLibraryBucket/cywong@vtc.edu.hk/test.pdf