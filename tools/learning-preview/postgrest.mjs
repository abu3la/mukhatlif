import { URL } from 'node:url';
/** Loopback-only PostgreSQL REST test adapter. Never used by application builds. */
import { PGlite } from '../../apps/api/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
export async function startDatabase(port = 18788) {
  const db = new PGlite('/private/tmp/mukhtalif-native-learning-db');
  await db.waitReady;
  const exists = await db.query("select to_regclass('public.learning_courses') as name");
  if (!exists.rows[0].name) {
    await db.exec(
      'create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table public.schema_migrations(filename text primary key);',
    );
    await db.exec(
      readFileSync(
        new URL('../../apps/api/supabase/migrations/0025_learning.sql', import.meta.url),
        'utf8',
      ),
    );
  }
  for (let i = 1; i <= 3; i++)
    await db.query('insert into auth.users values($1) on conflict do nothing', [
      `00000000-0000-4000-8000-00000000000${i}`,
    ]);
  const tables = new Set([
    'learning_courses',
    'learning_enrollments',
    'learning_assets',
    'learning_media_tickets',
  ]);
  const sqlName = (s) => {
    if (!/^[a-z_]+$/.test(s)) throw Error('Invalid column');
    return '"' + s + '"';
  };
  const server = createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://localhost'),
        path = u.pathname.replace('/rest/v1/', '');
      let raw = '';
      for await (const part of req) raw += part;
      const body = raw ? JSON.parse(raw) : null;
      let rows = [];
      if (path.startsWith('rpc/')) {
        const name = path.slice(4);
        if (name === 'learning_save_course')
          rows = (
            await db.query('select learning_save_course($1::jsonb) as result', [
              JSON.stringify(body.p_definition),
            ])
          ).rows;
        else if (name === 'learning_enroll')
          rows = (
            await db.query('select learning_enroll($1,$2,$3,$4::jsonb) as result', [
              body.p_course,
              body.p_user,
              body.p_name,
              JSON.stringify(body.p_state),
            ])
          ).rows;
        else throw Error('Unknown RPC');
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(rows[0].result));
        return;
      }
      if (!tables.has(path)) throw Error('Unknown table');
      const params = [],
        where = [];
      for (const [k, v] of u.searchParams) {
        if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
        const dot = v.indexOf('.'),
          op = v.slice(0, dot),
          value = v.slice(dot + 1);
        const operators = { eq: '=', gt: '>', lt: '<' };
        if (!operators[op]) throw Error('Unknown operator');
        params.push(value);
        where.push(`${sqlName(k)} ${operators[op]} $${params.length}`);
      }
      const filter = where.length ? ' where ' + where.join(' and ') : '';
      const encode = (v) => (typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
      if (req.method === 'POST') {
        const keys = Object.keys(body);
        rows = (
          await db.query(
            `insert into ${sqlName(path)} (${keys.map(sqlName)}) values (${keys.map((_, i) => '$' + (i + 1))}) returning *`,
            keys.map((k) => encode(body[k])),
          )
        ).rows;
      } else if (req.method === 'PATCH') {
        const fields = Object.entries(body).map(([k, v]) => {
          params.push(encode(v));
          return `${sqlName(k)}=$${params.length}`;
        });
        rows = (
          await db.query(
            `update ${sqlName(path)} set ${fields.join(',')}${filter} returning *`,
            params,
          )
        ).rows;
      } else if (req.method === 'GET') {
        rows = (await db.query(`select * from ${sqlName(path)}${filter}`, params)).rows;
        if (u.searchParams.get('select')?.includes('learning_courses('))
          for (const r of rows)
            r.learning_courses = (
              await db.query('select definition from learning_courses where id=$1', [r.course_id])
            ).rows[0];
      } else throw Error('Unsupported method');
      res.setHeader('content-type', 'application/json');
      if (req.method === 'POST' || req.method === 'PATCH') {
        res.statusCode = 200;
        res.end(
          JSON.stringify(req.headers.prefer?.includes('return=representation') ? rows : null),
        );
      } else
        res.end(
          JSON.stringify(
            req.headers.accept?.includes('vnd.pgrst.object') ? (rows[0] ?? null) : rows,
          ),
        );
    } catch (e) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ message: e.message }));
    }
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return { db, server };
}
