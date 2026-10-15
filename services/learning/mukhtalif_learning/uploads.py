"""Bounded, resumable private uploads. Each request uses at most one MiB."""
import base64
import hashlib
import json
import os
import re
import time
from pathlib import Path
import frappe
from .domain import check, number, text

MAX_SIZE = 512 * 1024 * 1024
CHUNK_SIZE = 1024 * 1024


def valid_content(filename, content):
    extension = filename.lower().rsplit('.', 1)[-1]
    return ((extension == 'pdf' and content.startswith(b'%PDF-')) or
            (extension == 'mp4' and content[4:8] == b'ftyp') or
            (extension == 'webm' and content.startswith(b'\x1aE\xdf\xa3')) or
            (extension == 'mp3' and (content.startswith(b'ID3') or content[:2] in (b'\xff\xfb', b'\xff\xf3', b'\xff\xf2'))))


def folder():
    path = Path(frappe.get_site_path('private', 'mukhtalif_uploads'))
    path.mkdir(parents=True, exist_ok=True)
    return path


def start(course_id, payload):
    from .api import sign
    from .storage import remote
    remote()
    filename = text(payload.get('filename'), 120, True)
    check(re.fullmatch(r'[a-zA-Z0-9_.-]{1,120}\.(pdf|mp4|webm|mp3)', filename, re.I), 'صيغة الملف غير مدعومة.')
    size = number(payload.get('size'), 1, MAX_SIZE)
    check(int(size) == size)
    upload_id = frappe.generate_hash(length=32)
    data = {'id': upload_id, 'course': course_id, 'filename': f'{upload_id}.{filename.rsplit(".", 1)[-1].lower()}', 'size': size, 'exp': int(time.time()) + 7200}
    ticket = base64.urlsafe_b64encode(json.dumps(data).encode()).decode()
    path = folder() / (upload_id + '.part')
    path.touch(mode=0o600, exist_ok=False)
    return {'token': ticket + '.' + sign(ticket), 'chunkSize': CHUNK_SIZE}


def read_token(course_id, token):
    import hmac
    from .api import sign
    check(isinstance(token, str) and len(token) < 3000)
    try:
        ticket, signature = token.split('.')
        check(hmac.compare_digest(sign(ticket), signature))
        data = json.loads(base64.urlsafe_b64decode(ticket))
        check(data['course'] == course_id and data['exp'] >= time.time(), 'انتهت مهلة الرفع. أعد اختيار الملف.')
        return data
    except (ValueError, KeyError):
        check(False, 'جلسة الرفع غير صالحة.')


def chunk(course_id, payload):
    data = read_token(course_id, payload.get('token'))
    offset = number(payload.get('offset'), 0, data['size'])
    check(int(offset) == offset)
    try:
        content = base64.b64decode(payload.get('content', ''), validate=True)
    except (ValueError, TypeError):
        check(False)
    check(0 < len(content) <= CHUNK_SIZE and offset + len(content) <= data['size'])
    with frappe.cache.lock('mukhtalif-upload:' + data['id'], timeout=30, blocking_timeout=5):
        path = folder() / (data['id'] + '.part')
        check(path.exists(), 'أعد اختيار الملف لبدء الرفع.')
        with path.open('r+b') as handle:
            actual = path.stat().st_size
            if offset < actual:
                handle.seek(offset)
                check(handle.read(len(content)) == content, 'المقطع المرسل لا يطابق الملف.')
                return {'offset': actual}
            check(offset == actual, 'ترتيب مقاطع الملف غير صحيح.')
            handle.seek(offset); handle.write(content); handle.flush()
        return {'offset': offset + len(content)}


def finish(course_id, payload):
    data = read_token(course_id, payload.get('token'))
    from . import storage
    use_r2 = storage.remote()
    file_url = '/private/files/' + data['filename']
    with frappe.cache.lock('mukhtalif-upload:' + data['id'], timeout=60, blocking_timeout=5):
        if use_r2 and file_url in storage.assets(course_id):
            return {'file': file_url}
        if not use_r2 and frappe.db.exists('File', {'file_url': file_url, 'attached_to_doctype': 'LMS Course', 'attached_to_name': course_id, 'is_private': 1}):
            return {'file': file_url}
        path = folder() / (data['id'] + '.part')
        check(path.exists() and path.stat().st_size == data['size'], 'لم يكتمل رفع الملف.')
        with path.open('rb') as handle:
            check(valid_content(data['filename'], handle.read(32)), 'صيغة الملف لا تطابق محتواه.')
            handle.seek(0)
            digest = hashlib.file_digest(handle, 'md5').hexdigest()
        if use_r2:
            return storage.put(course_id, file_url, path, data)
        destination = Path(frappe.get_site_path('private', 'files', data['filename']))
        os.replace(path, destination)
        # Register the blob without reading a 512 MiB video into memory. This flag
        # preserves native File validation and attachment hooks for an existing blob.
        doc = frappe.get_doc({'doctype': 'File', 'file_name': data['filename'], 'file_url': file_url, 'file_size': data['size'], 'content_hash': digest, 'is_private': 1, 'attached_to_doctype': 'LMS Course', 'attached_to_name': course_id})
        doc.flags.copy_from_existing_file = True
        frappe.db.after_rollback.add(lambda: os.replace(destination, path) if destination.exists() else None)
        doc.insert(ignore_permissions=True)
        return {'file': doc.file_url}


def cleanup():
    for path in folder().glob('*.part'):
        if path.is_file() and path.stat().st_mtime < time.time() - 86400:
            path.unlink()
