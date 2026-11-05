import { URL } from 'node:url';
/** Opt-in, loopback-only browser QA fixture. Never imported by the application. */
import { it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import type * as Service from './service';
vi.mock('./service', async (original) => {
  const actual = await original<typeof Service>();
  return {
    ...actual,
    registrationRequest: (
      env: Parameters<typeof actual.registrationRequest>[0],
      ...args: Parameters<typeof actual.registrationRequest> extends [unknown, ...infer R]
        ? R
        : never
    ) =>
      actual.registrationRequest(
        {
          ...env,
          SUPABASE_URL: 'http://127.0.0.1:8796',
          SUPABASE_SERVICE_ROLE_KEY: 'local-preview-only',
        },
        ...args,
      ),
  };
});
it.skipIf(process.env.REGISTRATION_PREVIEW !== '1')(
  'runs the isolated PostgreSQL-backed preview',
  async () => {
    const db = new PGlite(
      process.env.REGISTRATION_PREVIEW_DB ?? '/private/tmp/mukhtalif-registration-preview-db',
    );
    const exists = await db.query("select 1 from pg_tables where tablename='registration_forms'");
    if (!exists.rows.length) {
      await db.exec(
        'create role anon;create role authenticated;create role service_role bypassrls;create table public.schema_migrations(filename text primary key);',
      );
      await db.exec(
        readFileSync(
          new URL('../../supabase/migrations/0026_registration_forms.sql', import.meta.url),
          'utf8',
        ),
      );
    }
    const rest = new Hono();
    rest.onError((e, c) => c.json({ message: e.message }, 400));
    rest.post('/rest/v1/rpc/registration_save', async (c) => {
      const b = await c.req.json();
      const r = await db.query<{ result: unknown }>('select registration_save($1::jsonb) result', [
        JSON.stringify(b.p_definition),
      ]);
      return c.json(r.rows[0].result);
    });
    rest.post('/rest/v1/rpc/registration_submit', async (c) => {
      const b = await c.req.json();
      await db.query('select registration_submit($1,$2,$3,$4::jsonb)', [
        b.p_form,
        b.p_revision,
        b.p_request,
        JSON.stringify(b.p_answers),
      ]);
      return c.json(null);
    });
    rest.get('/rest/v1/registration_forms', async (c) => {
      const id = c.req.query('id')?.slice(3);
      const r = id
        ? await db.query('select definition from registration_forms where id=$1', [id])
        : await db.query('select definition from registration_forms order by updated_at desc');
      return c.json(c.req.header('Accept')?.includes('object') ? (r.rows[0] ?? null) : r.rows);
    });
    rest.get('/rest/v1/registration_responses', async (c) => {
      const id = c.req.query('form_id')?.slice(3);
      const search = c.req.query('search_text')?.slice(6) ?? '%';
      const before = c.req.query('created_at')?.slice(4) ?? new Date().toISOString();
      const offset = Number(c.req.query('offset') ?? 0),
        limit = Number(c.req.query('limit') ?? 100);
      const count = await db.query<{ n: number }>(
        'select count(*)::int n from registration_responses where form_id=$1 and search_text ilike $2 and created_at<=$3',
        [id, search, before],
      );
      const r = await db.query(
        'select id,form_id,answers,fields,created_at from registration_responses where form_id=$1 and search_text ilike $2 and created_at<=$3 order by created_at desc,id limit $4 offset $5',
        [id, search, before, limit, offset],
      );
      c.header('Content-Range', `${offset}-${offset + r.rows.length - 1}/${count.rows[0].n}`);
      return c.json(r.rows);
    });
    serve({ hostname: '127.0.0.1', port: 8796, fetch: rest.fetch });
    const { default: app } = await import('../index');
    serve({
      hostname: '127.0.0.1',
      port: 8795,
      fetch: (r) =>
        app.fetch(r, {
          APP_ENV: 'development',
          ALLOW_DEV_AUTH: 'true',
          CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:3111,http://127.0.0.1:3112',
        }),
    });
    console.log('Registration QA API ready: http://127.0.0.1:8795 (local fixture, no remote data)');
    await new Promise(() => {});
  },
  3600000,
);
