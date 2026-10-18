import type { Env } from '../env';
import { learningDb, checkDb, type Actor } from './service';
import { LearningError } from './domain';
const CHUNK = 5 * 1024 * 1024;
const mime: Record<string, string> = {
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
};
export async function upload(
  env: Env,
  courseId: string,
  action: string,
  p: Record<string, unknown>,
  actor: Actor,
) {
  const bucket = env.MEDIA,
    db = learningDb(env);
  if (!bucket?.createMultipartUpload || !bucket.resumeMultipartUpload)
    throw new LearningError(503, 'خدمة رفع الملفات غير متاحة.');
  if (action === 'studio.upload-start') {
    const filename = String(p.filename),
      ext = filename.split('.').at(-1)!.toLowerCase(),
      id = `${crypto.randomUUID()}.${ext}`;
    const key = `learning/${env.DEPLOYMENT_PLATFORM === 'hostinger' ? 'production' : 'development'}/${courseId}/${id}`;
    const multipart = await bucket.createMultipartUpload(key, {
      httpMetadata: { contentType: mime[ext] },
    });
    const inserted = await db.from('learning_assets').insert({
      id,
      course_id: courseId,
      object_key: key,
      filename,
      size: p.size,
      mime: mime[ext],
      owner_id: actor.id,
      upload_id: multipart.uploadId,
    });
    if (inserted.error) {
      await multipart.abort();
      checkDb(inserted.error);
    }
    return { token: id, chunkSize: CHUNK };
  }
  const r = await db
    .from('learning_assets')
    .select('*')
    .eq('id', p.token)
    .eq('course_id', courseId)
    .eq('owner_id', actor.id)
    .maybeSingle();
  checkDb(r.error);
  const a = r.data;
  if (!a || Date.now() - Date.parse(a.created_at) > 24 * 3600 * 1000)
    throw new LearningError(422, 'انتهت صلاحية الرفع. ارفع الملف مجددًا.');
  if (a.ready) {
    if (action === 'studio.upload-finish') return { file: `/private/files/${a.id}` };
    throw new LearningError(409, 'اكتمل رفع الملف.');
  }
  const multipart = bucket.resumeMultipartUpload(a.object_key, a.upload_id);
  if (action === 'studio.upload-chunk') {
    if (p.offset !== a.received)
      throw new LearningError(409, 'ترتيب أجزاء الملف غير صحيح. أعد الرفع.');
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(String(p.content)), (c) => c.charCodeAt(0));
    } catch {
      throw new LearningError(422, 'جزء الملف غير صالح.');
    }
    if (bytes.length !== Math.min(CHUNK, a.size - a.received) || !bytes.length)
      throw new LearningError(422, 'حجم جزء الملف غير صحيح.');
    if (a.received === 0) {
      const ascii = (start: number, length: number) =>
        String.fromCharCode(...bytes.subarray(start, start + length));
      const valid =
        a.mime === 'application/pdf'
          ? ascii(0, 5) === '%PDF-'
          : a.mime === 'video/mp4'
            ? ascii(4, 4) === 'ftyp'
            : a.mime === 'video/webm'
              ? [0x1a, 0x45, 0xdf, 0xa3].every((value, index) => bytes[index] === value)
              : ascii(0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
      if (!valid) throw new LearningError(422, 'محتوى الملف لا يطابق نوعه. اختر ملفًا صالحًا.');
    }
    const part = await multipart.uploadPart(a.parts.length + 1, bytes.buffer as ArrayBuffer);
    const saved = await db
      .from('learning_assets')
      .update({ parts: [...a.parts, part], received: a.received + bytes.length })
      .eq('id', a.id)
      .eq('received', a.received)
      .select('id');
    checkDb(saved.error);
    if (!saved.data?.length) throw new LearningError(409, 'يوجد رفع آخر لهذا الملف.');
    return { received: a.received + bytes.length };
  }
  if (a.received !== a.size) throw new LearningError(422, 'ارفع جميع أجزاء الملف أولًا.');
  // If completion succeeded but the database update failed, recover from the object.
  const existing = await bucket.head(a.object_key);
  const completed = existing ?? (await multipart.complete(a.parts));
  if (completed.size !== a.size) throw new LearningError(422, 'حجم الملف المرفوع غير مطابق.');
  const saved = await db
    .from('learning_assets')
    .update({ ready: true, upload_id: null })
    .eq('id', a.id);
  checkDb(saved.error);
  return { file: `/private/files/${a.id}` };
}
