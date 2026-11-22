import type { Env } from '../env';
import type { ObjectStorageUploadedPart } from '../storage/object-storage';
import { getMediaUploadSigner, MAX_SIGNED_URL_SECONDS } from '../storage/r2-upload-signer';
import { learningDb, checkDb, type Actor } from './service';
import { LearningError } from './domain';
/** Every part but the last has exactly this size, as R2 multipart requires. */
const CHUNK = 5 * 1024 * 1024;
const UPLOAD_LIFETIME_MS = 24 * 3600 * 1000;
const mime: Record<string, string> = {
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mp3: 'audio/mpeg',
};
/** The first bytes must match the declared type, whichever way the bytes arrived. */
function matchesType(type: string, bytes: Uint8Array): boolean {
  const ascii = (start: number, length: number) =>
    String.fromCharCode(...bytes.subarray(start, start + length));
  if (type === 'application/pdf') return ascii(0, 5) === '%PDF-';
  if (type === 'video/mp4') return ascii(4, 4) === 'ftyp';
  if (type === 'video/webm')
    return [0x1a, 0x45, 0xdf, 0xa3].every((value, index) => bytes[index] === value);
  return ascii(0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
}
const expired = () => new LearningError(422, 'انتهت صلاحية الرفع. ارفع الملف مجددًا.');
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
    // Direct means the browser sends the parts to R2 itself, through signed links.
    return getMediaUploadSigner(env)
      ? { token: id, chunkSize: CHUNK, direct: true }
      : { token: id, chunkSize: CHUNK };
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
  const age = a ? Date.now() - Date.parse(a.created_at) : Number.POSITIVE_INFINITY;
  if (!a || age > UPLOAD_LIFETIME_MS) throw expired();
  if (a.ready) {
    if (action === 'studio.upload-finish') return { file: `/private/files/${a.id}` };
    throw new LearningError(409, 'اكتمل رفع الملف.');
  }
  const partCount = Math.ceil(a.size / CHUNK);
  if (action === 'studio.upload-sign') {
    const signer = getMediaUploadSigner(env);
    if (!signer) throw new LearningError(503, 'الرفع المباشر غير متاح الآن.');
    if (a.received !== 0)
      throw new LearningError(409, 'بدأ رفع هذا الملف بطريقة أخرى. ارفعه مجددًا.');
    const parts = p.parts as number[];
    if (parts.some((part) => part > partCount) || new Set(parts).size !== parts.length)
      throw new LearningError(422, 'أرقام أجزاء الملف غير صحيحة.');
    // A link never outlives the upload it belongs to.
    const seconds = Math.min(MAX_SIGNED_URL_SECONDS, Math.floor((UPLOAD_LIFETIME_MS - age) / 1000));
    if (seconds < 60) throw expired();
    const urls = await Promise.all(
      parts.map(async (part) => ({
        part,
        url: await signer.uploadPartUrl(a.object_key, a.upload_id, part, seconds),
      })),
    );
    return { urls, expiresIn: seconds };
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
    if (a.received === 0 && !matchesType(a.mime, bytes))
      throw new LearningError(422, 'محتوى الملف لا يطابق نوعه. اختر ملفًا صالحًا.');
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
  const direct = Array.isArray(p.parts);
  let parts: ObjectStorageUploadedPart[];
  if (direct) {
    if (a.received !== 0)
      throw new LearningError(409, 'بدأ رفع هذا الملف بطريقة أخرى. ارفعه مجددًا.');
    const reported = p.parts as { part: number; etag: string }[];
    if (reported.length !== partCount || reported.some(({ part }, index) => part !== index + 1))
      throw new LearningError(422, 'ارفع جميع أجزاء الملف أولًا.');
    parts = reported.map(({ part, etag }) => ({
      partNumber: part,
      etag: etag.replace(/^"|"$/g, ''),
    }));
  } else {
    if (a.received !== a.size) throw new LearningError(422, 'ارفع جميع أجزاء الملف أولًا.');
    parts = a.parts;
  }
  // If completion succeeded but the database update failed, recover from the object.
  let completed = await bucket.head(a.object_key);
  if (!completed) {
    try {
      completed = await multipart.complete(parts);
    } catch (error) {
      if (!direct) throw error;
      // R2 checks every reported ETag; a missing or wrong part ends here.
      throw new LearningError(503, 'تعذّر تجميع أجزاء الملف. حاول مجددًا.');
    }
  }
  if (completed.size !== a.size) {
    if (direct) await bucket.delete(a.object_key);
    throw new LearningError(422, 'حجم الملف المرفوع غير مطابق.');
  }
  if (direct) {
    // These bytes never passed through the API, so check the start of the stored file.
    const start = await bucket.get(a.object_key, {
      range: { offset: 0, length: Math.min(16, a.size) },
    });
    const bytes = start ? new Uint8Array(await new Response(start.body).arrayBuffer()) : null;
    if (!bytes || !matchesType(a.mime, bytes)) {
      await bucket.delete(a.object_key);
      throw new LearningError(422, 'محتوى الملف لا يطابق نوعه. اختر ملفًا صالحًا.');
    }
  }
  const saved = await db
    .from('learning_assets')
    .update({
      ready: true,
      upload_id: null,
      ...(direct ? { parts, received: a.size } : {}),
    })
    .eq('id', a.id);
  checkDb(saved.error);
  return { file: `/private/files/${a.id}` };
}
