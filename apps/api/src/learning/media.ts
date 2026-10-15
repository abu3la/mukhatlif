import type { Context } from 'hono';
import type { CourseDefinition } from '@mukhtalif/types';
import type { Env } from '../env';
import type { AppEnv } from '../auth';
import { learningDb, checkDb } from './service';
import { files, LearningError } from './domain';
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
  const cr = await db
    .from('learning_courses')
    .select('definition')
    .eq('id', ticket.course_id)
    .maybeSingle();
  checkDb(cr.error);
  const course = cr.data?.definition as CourseDefinition;
  if (!course?.published || !files(course).includes(ticket.file))
    throw new LearningError(404, 'الملف غير متاح.');
  if (ticket.user_id) {
    const e = await db
      .from('learning_enrollments')
      .select('user_id')
      .eq('course_id', course.id)
      .eq('user_id', ticket.user_id)
      .maybeSingle();
    checkDb(e.error);
    if (!e.data) throw new LearningError(403, 'سجّل في الدورة أولًا.');
  } else if (ticket.file !== course.trailer) throw new LearningError(403, 'الملف غير متاح.');
  const ar = await db
    .from('learning_assets')
    .select('*')
    .eq('id', ticket.file.slice('/private/files/'.length))
    .eq('course_id', course.id)
    .eq('ready', true)
    .maybeSingle();
  checkDb(ar.error);
  if (!ar.data || !c.env.MEDIA) throw new LearningError(404, 'الملف غير موجود.');
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
