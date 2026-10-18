import { beforeEach, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { AppEnv } from '../auth';
import type { Env } from '../env';
import { serveLearningMedia } from './media';
import { LearningError } from './domain';
const db = vi.hoisted(() => ({ tables: {} as Record<string, unknown> }));
vi.mock('./service', () => ({
  learningDb: () => ({ from: (table: string) => {
    const query = { select: () => query, eq: () => query, gt: () => query,
      maybeSingle: async () => ({ data: db.tables[table], error: null }) };
    return query;
  } }),
  checkDb: (error: unknown) => { if (error) throw error; },
}));
const file = '/private/files/video';
const get = vi.fn(async () => ({ body: new Uint8Array([1, 2, 3, 4]) }));
const app = new Hono<AppEnv>();
app.get('/media/:ticket', serveLearningMedia);
app.onError((error, c) => c.json({ error: error.message }, error instanceof LearningError ? error.status : 500));
const env = { MEDIA: { head: async () => ({ size: 4 }), get } } as unknown as Env;
const request = (headers: Record<string, string> = {}) => app.request('/media/11111111-1111-4111-8111-111111111111', { headers }, env);
beforeEach(() => {
  get.mockClear();
  db.tables = {
    learning_media_tickets: { course_id: 'course', file, user_id: 'learner' },
    learning_courses: { definition: { id: 'course', published: true, resources: [], lessons: [
      { id: 'first', video: '', resources: [] }, { id: 'second', video: file, resources: [] },
    ] } },
    learning_enrollments: { user_id: 'learner', state: { progress: { first: { complete: true } } } },
    learning_assets: { object_key: 'private/video', mime: 'video/mp4', filename: 'lesson.mp4' },
  };
});
it('rejects expired or missing tickets without accessing R2', async () => {
  db.tables.learning_media_tickets = null;
  expect((await request()).status).toBe(403);
  expect(get).not.toHaveBeenCalled();
});
it('rechecks enrollment on every media request', async () => {
  db.tables.learning_enrollments = null;
  expect((await request()).status).toBe(403);
  expect(get).not.toHaveBeenCalled();
});
it('rejects a locked lesson even with a previously issued media ticket', async () => {
  db.tables.learning_enrollments = { state: { progress: {} } };
  expect((await request()).status).toBe(403);
  expect(get).not.toHaveBeenCalled();
});
it('blocks direct browser navigation to a private lesson video', async () => {
  expect((await request({ 'Sec-Fetch-Dest': 'document' })).status).toBe(403);
  expect(get).not.toHaveBeenCalled();
});
it('keeps authorized video range playback private and working', async () => {
  const result = await request({ 'Sec-Fetch-Dest': 'video', Range: 'bytes=0-3' });
  expect(result.status).toBe(206);
  expect(result.headers.get('Content-Range')).toBe('bytes 0-3/4');
  expect(result.headers.get('Cache-Control')).toBe('private, no-store');
  expect(get).toHaveBeenCalledWith('private/video', { range: { offset: 0, length: 4 } });
});
it('does not block an authorized worksheet download', async () => {
  db.tables.learning_assets = { object_key: 'private/document', mime: 'application/pdf', filename: 'worksheet.pdf' };
  const result = await request({ 'Sec-Fetch-Dest': 'document' });
  expect(result.status).toBe(200);
  expect(result.headers.get('Content-Disposition')).toContain('attachment');
});
