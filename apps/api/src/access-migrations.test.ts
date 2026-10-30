import { readdirSync, readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { PERMISSION_IDS } from '@mukhtalif/types';
import { beforeAll, describe, expect, it } from 'vitest';

const db = new PGlite();
const actor = 'std-owner';

async function rpc<T>(call: string, params: unknown[]): Promise<T> {
  const { rows } = await db.query<{ result: T }>(`select ${call} as result`, params);
  return rows[0].result;
}

function createRole(name: string, permissions: readonly string[]) {
  return rpc<{ status: string; role?: { id: string; permissions: string[] } }>(
    'public.create_studio_role($1, $2, $3, $4, gen_random_uuid())',
    [actor, name, '', permissions],
  );
}

// Replays the real migration chain, so these checks cover the functions and
// enum that production runs rather than a hand-written copy of them.
beforeAll(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    create table public.schema_migrations (filename text primary key);
  `);
  const directory = new URL('../supabase/migrations/', import.meta.url);
  const files = readdirSync(directory).filter((file) => file.endsWith('.sql'));
  for (const file of files.sort()) {
    await db.exec(readFileSync(new URL(file, directory), 'utf8'));
  }
  await db.query(
    `insert into public.studio_members (id, email, display_name, role_id, status, accepted_at)
     values ($1, 'owner@example.com', 'Owner', 'admin', 'active', now())`,
    [actor],
  );
}, 60000);

describe('Academy permission migrations', () => {
  it('keeps the database vocabulary equal to the shared contract', async () => {
    const { rows } = await db.query<{ value: string }>(
      `select unnest(enum_range(null::public.studio_permission))::text as value`,
    );
    expect(rows.map((row) => row.value).sort()).toEqual([...PERMISSION_IDS].sort());
    await expect(rpc('public.valid_studio_permissions($1)', [[...PERMISSION_IDS]])).resolves.toBe(
      true,
    );
  });

  it('stores no Academy permission, so the running API can never read an unknown value', async () => {
    const { rows } = await db.query<{ role: string; total: number; academy: number }>(
      `select role, count(*)::int as total,
         count(*) filter (where permission::text like 'courses.%')::int as academy
       from public.role_permissions group by role order by role`,
    );
    expect(rows).toEqual([
      { role: 'admin', total: 15, academy: 0 },
      { role: 'editor', total: 11, academy: 0 },
    ]);
  });

  it('records both migrations in the ledger', async () => {
    const { rows } = await db.query<{ filename: string }>(
      `select filename from public.schema_migrations where filename >= '0026' order by filename`,
    );
    expect(rows.map((row) => row.filename)).toEqual([
      '0026_academy_permissions.sql',
      '0027_academy_role_functions.sql',
    ]);
  });

  it('creates a role with only Academy access and returns canonical order', async () => {
    const created = await createRole('رفع ورش الأكاديمية', ['courses.manage', 'courses.view']);
    expect(created.status).toBe('created');
    expect(created.role?.permissions).toEqual(['courses.view', 'courses.manage']);

    const complete = await createRole('دور كامل', [...PERMISSION_IDS]);
    expect(complete.role?.permissions).toEqual([...PERMISSION_IDS]);
  });

  it('rejects Academy management without the view permission', async () => {
    const created = await createRole('دور ناقص', ['courses.manage']);
    expect(created.status).toBe('invalid_permissions');
  });

  it('updates a custom role and keeps the protected role immutable', async () => {
    const { role } = await createRole('مراجع الأكاديمية', ['overview.view']);
    const updated = await rpc<{ status: string; role: { permissions: string[] } }>(
      'public.change_role_permissions($1, $2, $3, gen_random_uuid())',
      [actor, role?.id, ['courses.view']],
    );
    expect(updated.status).toBe('updated');
    expect(updated.role.permissions).toEqual(['courses.view']);

    const protectedRole = await rpc<{ status: string }>(
      'public.change_role_permissions($1, $2, $3, gen_random_uuid())',
      [actor, 'admin', ['courses.view']],
    );
    expect(protectedRole.status).toBe('immutable_role');
  });
});
