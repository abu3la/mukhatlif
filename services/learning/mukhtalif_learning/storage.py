"""Private R2 storage; filesystem persistence is restricted to test sites."""
import json
import mimetypes
import os
import re
import frappe
from .domain import check


def remote():
    if os.environ.get('MUKHTALIF_LEARNING_STORAGE') == 'r2':
        return True
    check(bool(frappe.conf.get('allow_tests')) and frappe.local.site.startswith('learning-test.'), 'لم يُجهز تخزين الدورات بعد.')
    return False


def connection():
    import boto3
    account = os.environ.get('MUKHTALIF_R2_ACCOUNT_ID', '')
    environment = os.environ.get('MUKHTALIF_LEARNING_ENVIRONMENT', '')
    check(bool(re.fullmatch(r'[a-f0-9]{32}', account)) and environment in ('development', 'production'), 'إعداد تخزين الدورات غير صالح.')
    key = os.environ.get('MUKHTALIF_R2_ACCESS_KEY_ID', '')
    secret = os.environ.get('MUKHTALIF_R2_SECRET_ACCESS_KEY', '')
    check(bool(key and secret), 'لم يُجهز تخزين الدورات بعد.')
    client = boto3.client('s3', endpoint_url=f'https://{account}.r2.cloudflarestorage.com', aws_access_key_id=key, aws_secret_access_key=secret, region_name='auto')
    return client, 'mukhtalif-media', f'learning/{environment}/'


def assets(course_id):
    return json.loads(frappe.db.get_value('LMS Course', course_id, 'custom_mukhtalif_assets') or '{}')


def put(course_id, file_url, path, data):
    from boto3.s3.transfer import TransferConfig
    client, bucket, prefix = connection()
    key = prefix + data['filename']
    content_type = mimetypes.guess_type(data['filename'])[0] or 'application/octet-stream'
    client.upload_file(str(path), bucket, key, ExtraArgs={'ContentType': content_type}, Config=TransferConfig(multipart_threshold=8*1024*1024, multipart_chunksize=8*1024*1024, max_concurrency=2))
    frappe.db.sql('SELECT name FROM `tabLMS Course` WHERE name=%s FOR UPDATE', course_id)
    manifest = assets(course_id)
    manifest[file_url] = {'key': key, 'filename': data['filename'], 'size': data['size'], 'contentType': content_type}
    frappe.db.set_value('LMS Course', course_id, 'custom_mukhtalif_assets', json.dumps(manifest), update_modified=False)
    frappe.db.after_commit.add(lambda: path.unlink(missing_ok=True))
    return {'file': file_url}


def download(course_id, file_url):
    client, bucket, prefix = connection()
    item = assets(course_id).get(file_url)
    check(bool(item and item['key'].startswith(prefix)), 'الملف غير متاح.')
    disposition = 'inline' if item['filename'].endswith(('.mp4', '.mp3', '.webm')) else 'attachment'
    return client.generate_presigned_url('get_object', Params={'Bucket': bucket, 'Key': item['key'], 'ResponseContentType': item['contentType'], 'ResponseContentDisposition': f'{disposition}; filename="{item["filename"]}"'}, ExpiresIn=300)
