import { URL } from 'node:url';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { definition } from './domain';
const db = new PGlite();
const course = definition({
  id: 'course',
  title: 'دورة',
  description: 'وصف',
  category: '',
  skill: '',
  level: '',
  instructor: '',
  price: 99,
  published: true,
  lessons: [
    { id: 'lesson', title: 'درس', body: 'نص', video: '', durationSeconds: 0, resources: [] },
  ],
  resources: [],
});
const user = '00000000-0000-4000-8000-000000000001';
beforeAll(async () => {
  await db.exec(
    `create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create table public.schema_migrations(filename text primary key); insert into auth.users values('${user}');`,
  );
  await db.exec(
    readFileSync(new URL('../../supabase/migrations/0025_learning.sql', import.meta.url), 'utf8'),
  );
}, 30000);
afterAll(() => db.close());
describe('learning migration on PostgreSQL', () => {
  it('denies direct browser reads and mutations, including RPC execution', async () => {
    for (const role of ['anon', 'authenticated']) {
      for (const table of [
        'learning_courses',
        'learning_enrollments',
        'learning_assets',
        'learning_media_tickets',
      ]) {
        const r = await db.query<{ allowed: boolean }>(
          "select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE') as allowed",
          [role, table],
        );
        expect(r.rows[0].allowed).toBe(false);
      }
      const r = await db.query<{ allowed: boolean }>(
        "select has_function_privilege($1,'learning_enroll(text,uuid,text,jsonb)','EXECUTE') as allowed",
        [role],
      );
      expect(r.rows[0].allowed).toBe(false);
    }
  });
  it('creates one enrollment and reads price under a database lock', async () => {
    await db.query('select learning_save_course($1::jsonb)', [JSON.stringify(course)]);
    const s = { order: { amount: 0, id: 'first' } };
    const first = await db.query<{ state: { order: { amount: number; id: string } } }>(
      'select learning_enroll($1,$2,$3,$4::jsonb) as state',
      ['course', user, 'متعلم', JSON.stringify(s)],
    );
    expect(first.rows[0].state.order.amount).toBe(99);
    const next = await db.query<{ state: { order: { id: string } } }>(
      'select learning_enroll($1,$2,$3,$4::jsonb) as state',
      ['course', user, 'متعلم', JSON.stringify({ order: { amount: 1, id: 'second' } })],
    );
    expect(next.rows[0].state.order.id).toBe('first');
  });
  it('protects enrolled curriculum while allowing catalogue edits', async () => {
    const edited = { ...course, title: 'عنوان جديد' };
    await db.query('select learning_save_course($1::jsonb)', [JSON.stringify(edited)]);
    await expect(
      db.query('select learning_save_course($1::jsonb)', [
        JSON.stringify({ ...edited, lessons: [] }),
      ]),
    ).rejects.toThrow('learning_curriculum_locked');
  });
  it('supports compare-and-set without overwriting another device', async () => {
    const a = await db.query(
      'update learning_enrollments set revision=2 where course_id=$1 and user_id=$2 and revision=1 returning revision',
      ['course', user],
    );
    const b = await db.query(
      'update learning_enrollments set revision=3 where course_id=$1 and user_id=$2 and revision=1 returning revision',
      ['course', user],
    );
    expect(a.rows).toHaveLength(1);
    expect(b.rows).toHaveLength(0);
  });
});
