import type { Context } from 'hono';
import type { CourseDefinition } from '@mukhtalif/types';
import type { Env } from '../env';
import type { AppEnv } from '../auth';
import { learningDb, checkDb } from './service';
import { getRepository } from '../repo';
import { files, LearningError, assertVideoAccess, type State } from './domain';
/**
 * Marks a ticket an administrator opened from the Studio to check a file.
 * It lives in the ticket's `file` column, so no schema change is needed.
 */
const STUDIO_PREVIEW = 'studio-preview:';
const STUDIO_PREVIEW_MS = 30 * 60 * 1000;
/**
 * A short-lived link for an administrator to play or open a course file,
 * whether or not the course is published or the file is saved into it yet.
 */
export async function studioPreviewLink(
  env: Env,
  origin: string,
  courseId: string,
  file: string,
  adminId: string,
) {
  const db = learningDb(env);
  const asset = await db
    .from('learning_assets')
    .select('id')
    .eq('id', file.slice('/private/files/'.length))
    .eq('course_id', courseId)
    .eq('ready', true)
    .maybeSingle();
  checkDb(asset.error);
  if (!asset.data) throw new LearningError(404, 'الملف غير موجود في هذه الدورة.');
  const id = crypto.randomUUID();
  const r = await db.from('learning_media_tickets').insert({
    id,
    course_id: courseId,
    file: `${STUDIO_PREVIEW}${file}`,
    user_id: adminId,
    expires_at: new Date(Date.now() + STUDIO_PREVIEW_MS).toISOString(),
  });
  checkDb(r.error);
  return { url: `${origin}/courses/media/${id}` };
}
export async function assetLink(
  env: Env,
  origin: string,
  course: CourseDefinition,
  file: string,
  userId?: string,
) {
  if (!files(course).includes(file) || (!userId && file !== course.trailer))
    throw new LearningError(404, 'الملف غير موجود.');
  const db = learningDb(env),
    id = crypto.randomUUID();
  const r = await db.from('learning_media_tickets').insert({
    id,
    course_id: course.id,
    file,
    user_id: userId ?? null,
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  });
  checkDb(r.error);
  return { url: `${origin}/courses/media/${id}` };
}
export async function serveLearningMedia(c: Context<AppEnv>) {
  const db = learningDb(c.env),
    token = c.req.param('ticket') ?? '';
  if (!/^[a-f0-9-]{36}$/.test(token)) throw new LearningError(404, 'الرابط غير صالح.');
  const t = await db
    .from('learning_media_tickets')
    .select('*')
    .eq('id', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  checkDb(t.error);
  if (!t.data) throw new LearningError(403, 'انتهت صلاحية رابط الملف.');
  const ticket = t.data;
  const preview = String(ticket.file).startsWith(STUDIO_PREVIEW);
  // The stored row is never changed; `file` is the path with the marker removed.
  const file: string = preview ? String(ticket.file).slice(STUDIO_PREVIEW.length) : ticket.file;
  const cr = await db
    .from('learning_courses')
    .select('definition')
    .eq('id', ticket.course_id)
    .maybeSingle();
  checkDb(cr.error);
  const course = cr.data?.definition as CourseDefinition;
  if (preview) {
    // Rechecked on every request: a ticket outlives neither the role nor the membership.
    const member = ticket.user_id
      ? await getRepository(c.env).getStudioMemberByAuthId(ticket.user_id)
      : null;
    if (!course || member?.status !== 'active' || member.role !== 'admin')
      throw new LearningError(403, 'المعاينة متاحة للمدير فقط.');
  } else if (!course?.published || !files(course).includes(file))
    throw new LearningError(404, 'الملف غير متاح.');
  else if (ticket.user_id) {
    const e = await db
      .from('learning_enrollments')
      .select('user_id,state')
      .eq('course_id', course.id)
      .eq('user_id', ticket.user_id)
      .maybeSingle();
    checkDb(e.error);
    if (!e.data) throw new LearningError(403, 'سجّل في الدورة أولًا.');
    assertVideoAccess(course, e.data.state as State, file);
  } else if (file !== course.trailer) throw new LearningError(403, 'الملف غير متاح.');
  const ar = await db
    .from('learning_assets')
    .select('*')
    .eq('id', file.slice('/private/files/'.length))
    .eq('course_id', course.id)
    .eq('ready', true)
    .maybeSingle();
  checkDb(ar.error);
  if (!ar.data || !c.env.MEDIA) throw new LearningError(404, 'الملف غير موجود.');
  // Browser navigation to a lesson video is not an authorized playback surface.
  // This is a convenience barrier, not DRM: clients can spoof fetch metadata.
  if (ticket.user_id && ar.data.mime.startsWith('video/') && c.req.header('Sec-Fetch-Dest') === 'document') {
    throw new LearningError(403, 'شاهد الفيديو من داخل الدورة.');
  }
  const a = ar.data,
    head = await c.env.MEDIA.head(a.object_key);
  if (!head) throw new LearningError(404, 'الملف غير موجود.');
  const headers: Record<string, string> = {
    'Content-Type': a.mime,
    'Cache-Control': 'private, no-store',
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Disposition': `${a.mime === 'application/pdf' ? 'attachment' : 'inline'}; filename="${a.filename}"`,
  };
  let offset = 0,
    length = head.size,
    status = 200;
  const range = c.req.header('Range');
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!m || (!m[1] && !m[2]))
      return new Response(null, {
        status: 416,
        headers: { ...headers, 'Content-Range': `bytes */${head.size}` },
      });
    offset = m[1] ? Number(m[1]) : Math.max(0, head.size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), head.size - 1) : head.size - 1;
    if (offset >= head.size || end < offset)
      return new Response(null, {
        status: 416,
        headers: { ...headers, 'Content-Range': `bytes */${head.size}` },
      });
    length = end - offset + 1;
    status = 206;
    headers['Content-Range'] = `bytes ${offset}-${end}/${head.size}`;
  }
  headers['Content-Length'] = String(length);
  const object = await c.env.MEDIA.get(
    a.object_key,
    status === 206 ? { range: { offset, length } } : undefined,
  );
  if (!object) throw new LearningError(404, 'الملف غير موجود.');
  return new Response(object.body, { status, headers });
}
