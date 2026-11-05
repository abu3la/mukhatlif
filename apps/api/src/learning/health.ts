import { Hono } from 'hono';
import type { AppEnv } from '../auth';
import { learningDb } from './service';
export const learningHealthRoute = new Hono<AppEnv>();
learningHealthRoute.get('/', async (c) => {
  try {
    const db = learningDb(c.env);
    const ledger = await db
      .from('schema_migrations')
      .select('filename')
      .eq('filename', '0025_learning.sql')
      .abortSignal(AbortSignal.timeout(5000))
      .maybeSingle();
    if (ledger.error || !ledger.data) return c.json({ ready: false }, 503);
    const results = await Promise.all([
      db
        .from('learning_courses')
        .select('id,definition,revision')
        .limit(0)
        .abortSignal(AbortSignal.timeout(5000)),
      db
        .from('learning_enrollments')
        .select('course_id,user_id,state,revision')
        .limit(0)
        .abortSignal(AbortSignal.timeout(5000)),
      db
        .from('learning_assets')
        .select('id,course_id,object_key,ready')
        .limit(0)
        .abortSignal(AbortSignal.timeout(5000)),
      db
        .from('learning_media_tickets')
        .select('id,course_id,file,user_id,expires_at')
        .limit(0)
        .abortSignal(AbortSignal.timeout(5000)),
    ]);
    const ready = results.every((r) => !r.error);
    return c.json({ ready }, ready ? 200 : 503);
  } catch {
    return c.json({ ready: false }, 503);
  }
});
