import { afterEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

const read = (name) => readFileSync(new URL(`../supabase/${name}`, import.meta.url), 'utf8');
const migration = read('migrations/0023_episode_youtube.sql');
const verification = read('verify-0023-existing.sql');
const reconciliation = read('reconcile-0023-development-ledger.sql');
const databases = [];
afterEach(async () => {
  for (const db of databases.splice(0)) await db.close();
});

async function fixture() {
  const db = new PGlite();
  databases.push(db);
  await db.exec(`
    create table public.episodes(id text primary key, title text not null);
    create schema auth;
    create table auth.users(id text primary key);
    create table public.schema_migrations(filename text primary key,applied_at timestamptz default now());
    insert into public.schema_migrations(filename) values('0022_homepage_weekly_episodes.sql');
    insert into public.episodes(id,title) values('existing-video','Existing title'),('existing-null','Other title');
    insert into auth.users(id) values('existing-auth');
  `);
  await db.exec(migration);
  await db.exec(
    "update public.episodes set youtube_video_id='abcdefghijk' where id='existing-video';",
  );
  return db;
}

async function snapshot(db) {
  return (
    await db.query(`select json_build_object(
    'episodes',(select json_agg(e order by id) from public.episodes e),
    'auth',(select json_agg(a order by id) from auth.users a),
    'constraint',(select pg_get_constraintdef(oid) from pg_constraint where conname='episodes_youtube_video_id_format')
  ) as value;`)
  ).rows[0].value;
}

describe('development 0023 ledger reconciliation', () => {
  it('verifies the actual migration read-only and records only the missing ledger entry', async () => {
    const db = await fixture();
    const before = await snapshot(db);
    const result = await db.exec(verification);
    expect(result.at(-1).rows[0]).toEqual({
      filename: '0023_episode_youtube.sql',
      ddl_verified: true,
      migration_creates_index: false,
      ledger_recorded: false,
    });
    expect(await snapshot(db)).toEqual(before);
    await db.exec(reconciliation);
    expect(
      (await db.query('select filename from public.schema_migrations order by filename')).rows,
    ).toEqual([
      { filename: '0022_homepage_weekly_episodes.sql' },
      { filename: '0023_episode_youtube.sql' },
    ]);
    expect(await snapshot(db)).toEqual(before);
  });

  it.each([
    ['missing column', 'alter table public.episodes drop column youtube_video_id;'],
    ['wrong type', 'alter table public.episodes alter column youtube_video_id type varchar(11);'],
    [
      'unexpected default',
      "alter table public.episodes alter column youtube_video_id set default 'abcdefghijk';",
    ],
    [
      'different comment',
      "comment on column public.episodes.youtube_video_id is 'Changed comment';",
    ],
    [
      'missing constraint',
      'alter table public.episodes drop constraint episodes_youtube_video_id_format;',
    ],
    [
      'weaker constraint',
      'alter table public.episodes drop constraint episodes_youtube_video_id_format; alter table public.episodes add constraint episodes_youtube_video_id_format check(youtube_video_id is null or length(youtube_video_id)>0);',
    ],
    [
      'unvalidated constraint',
      "alter table public.episodes drop constraint episodes_youtube_video_id_format; alter table public.episodes add constraint episodes_youtube_video_id_format check(youtube_video_id is null or youtube_video_id ~ '^[A-Za-z0-9_-]{11}$') not valid;",
    ],
  ])('refuses to record the ledger for %s', async (_name, change) => {
    const db = await fixture();
    await db.exec(change);
    await expect(db.exec(verification)).rejects.toThrow('0023 verification failed');
    await expect(db.exec(reconciliation)).rejects.toThrow('0023 verification failed');
    await db.exec('rollback;');
    expect(
      (
        await db.query(
          "select count(*)::int as count from public.schema_migrations where filename='0023_episode_youtube.sql'",
        )
      ).rows[0].count,
    ).toBe(0);
  });

  it('refuses to replay an existing ledger entry', async () => {
    const db = await fixture();
    await db.exec(reconciliation);
    await expect(db.exec(reconciliation)).rejects.toThrow('already exists');
    await db.exec('rollback;');
    expect(
      (
        await db.query(
          "select count(*)::int as count from public.schema_migrations where filename='0023_episode_youtube.sql'",
        )
      ).rows[0].count,
    ).toBe(1);
  });

  it('requires the exact preceding migration ledger entry', async () => {
    const db = await fixture();
    await db.exec('delete from public.schema_migrations;');
    await expect(db.exec(reconciliation)).rejects.toThrow('0022 ledger prerequisite missing');
    await db.exec('rollback;');
    expect(
      (await db.query('select count(*)::int as count from public.schema_migrations')).rows[0].count,
    ).toBe(0);
  });
});
