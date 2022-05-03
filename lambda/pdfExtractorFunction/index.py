import urllib.parse
import os
import fitz
from common import *
from pathlib import Path

print('Loading function')

dimlimit = 0  # 100  # each image side must be greater than this
relsize = 0  # 0.05  # image : image size ratio must be larger than this (5%)
abssize = 0  # 2048  # absolute image size limit 2 KB: ignore if smaller


def extract_text(pdf_file_path):
    filename, file_extension = os.path.splitext(pdf_file_path)
    output_file = os.path.join(os.path.dirname(
        pdf_file_path), filename + "/pdf/extract_text.txt")
    with open(output_file, 'wb') as f:
        doc = fitz.open(pdf_file_path)
        for page in doc:
            blocks = page.get_text("blocks")
            blocks.sort(key=lambda b: (b[1], b[0]))
            for b in blocks:
                f.write(b[4].encode("utf-8"))
        f.close()


def recoverpix(doc, item):
    xref = item[0]  # xref of PDF image
    smask = item[1]  # xref of its /SMask

    # special case: /SMask or /Mask exists
    if smask > 0:
        pix0 = fitz.Pixmap(doc.extract_image(xref)["image"])
        mask = fitz.Pixmap(doc.extract_image(smask)["image"])
        pix = fitz.Pixmap(pix0, mask)
        if pix0.n > 3:
            ext = "pam"
        else:
            ext = "png"

        return {  # create dictionary expected by caller
            "ext": ext,
            "colorspace": pix.colorspace.n,
            "image": pix.tobytes(ext),
        }

    # special case: /ColorSpace definition exists
    # to be sure, we convert these cases to RGB PNG images
    if "/ColorSpace" in doc.xref_object(xref, compressed=True):
        pix = fitz.Pixmap(doc, xref)
        pix = fitz.Pixmap(fitz.csRGB, pix)
        return {  # create dictionary expected by caller
            "ext": "png",
            "colorspace": 3,
            "image": pix.tobytes("png"),
        }
    return doc.extract_image(xref)


def extract_pdf_media(pdf_file_path):
    filename, file_extension = os.path.splitext(pdf_file_path)
    imgdir = os.path.join(os.path.dirname(
        pdf_file_path), filename + "/pdf/")
    doc = fitz.open(pdf_file_path)
    page_count = doc.page_count  # number of pages
    xreflist = []
    imglist = []
    for pno in range(page_count):
        il = doc.get_page_images(pno)
        imglist.extend([x[0] for x in il])
        for img in il:
            xref = img[0]
            if xref in xreflist:
                continue
            width = img[2]
            height = img[3]
            if min(width, height) <= dimlimit:
                continue
            image = recoverpix(doc, img)
            n = image["colorspace"]
            imgdata = image["image"]

            if len(imgdata) <= abssize:
                continue
            if len(imgdata) / (width * height * n) <= relsize:
                continue
            imgfile = os.path.join(imgdir, "img%05i.%s" % (xref, image["ext"]))
            fout = open(imgfile, "wb")
            fout.write(imgdata)
            fout.close()
            xreflist.append(xref)

    imglist = list(set(imglist))
    print(len(set(imglist)), "images in total")
    print(len(xreflist), "images extracted")


def lambda_handler(event, context):
    clean_tmp()
    # Get the object from the event and show its content type
    bucket = event['Records'][0]['s3']['bucket']['name']
    key = urllib.parse.unquote_plus(
        event['Records'][0]['s3']['object']['key'], encoding='utf-8')
    try:
        file_path = save_file(bucket, key)

        filename, file_extension = os.path.splitext(file_path)
        output_dir = os.path.join(os.path.dirname(
            file_path), filename + "/pdf/")
        Path(output_dir).mkdir(parents=True, exist_ok=True)

        extract_text(file_path)
        extract_pdf_media(file_path)

        os.remove(file_path)
        copy_tmp_to_processing_bucket()
        return 'OK'
    except Exception as e:
        print(e)
        print('Error getting object {} from bucket {}. Make sure they exist and your bucket is in the same region as this function.'.format(key, bucket))
        raise e
