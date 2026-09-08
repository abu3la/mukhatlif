import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { smokeSql } from './migrate-customer-development.mjs';

let db;
beforeAll(async () => {
  db = new PGlite();
  // The migration depends on the current identity/engagement boundary only.
  // This fixture mirrors those columns without importing unrelated archive data.
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,aud text,role text);
    create table public.users(id text primary key,email text unique not null,display_name text not null,
      locale text default 'ar',created_at timestamptz default now(),auth_user_id uuid references auth.users(id));
    create unique index users_auth_user_id_unique on public.users(auth_user_id) where auth_user_id is not null;
    create table public.studio_members(id text primary key,auth_user_id uuid references auth.users(id));
    create table public.follows(user_id text not null references public.users(id),show_id text,primary key(user_id,show_id));
    create table public.playback_progress(user_id text not null references public.users(id),episode_id text,position_sec integer,primary key(user_id,episode_id));
    insert into auth.users(id,email,email_confirmed_at) values('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','existing@example.invalid',now());
    insert into public.users(id,email,display_name,auth_user_id) values('existing-customer','existing@example.invalid','Existing customer','aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa');
  `);
  await db.exec(
    readFileSync(
      new URL('../supabase/migrations/0024_customer_accounts_library.sql', import.meta.url),
      'utf8',
    ),
  );
}, 15000);
afterAll(async () => {
  await db?.close();
});

describe('customer migration on local PostgreSQL', () => {
  it('executes the same provisioning, identity, profile and clear smoke transaction as the deployment script', async () => {
    await db.exec(smokeSql);
    const result = await db.query(`select (select count(*) from auth.users)::int as auth_count,
      (select count(*) from public.users)::int as customer_count,
      (select count(*) from public.customer_profiles)::int as profile_count,
      (select count(*) from public.customer_libraries)::int as library_count;`);
    expect(result.rows[0]).toEqual({
      auth_count: 1,
      customer_count: 1,
      profile_count: 0,
      library_count: 0,
    });
  });

  it('enables RLS and grants only service-role RPC execution', async () => {
    const result = await db.query(`select
      (select relrowsecurity from pg_class where relname='customer_profiles') as profile_rls,
      (select relrowsecurity from pg_class where relname='customer_libraries') as library_rls,
      has_function_privilege('anon','public.provision_customer_account(uuid,text,text,text)','execute') as anon_rpc,
      has_function_privilege('authenticated','public.update_customer_profile(text,jsonb)','execute') as authenticated_rpc,
      has_function_privilege('service_role','public.clear_customer_library(text)','execute') as service_rpc;`);
    expect(result.rows[0]).toEqual({
      profile_rls: true,
      library_rls: true,
      anon_rpc: false,
      authenticated_rpc: false,
      service_rpc: true,
    });
    await db.exec('set role authenticated;');
    try {
      await expect(db.query('select * from public.customer_profiles')).rejects.toThrow(
        /permission denied/i,
      );
    } finally {
      await db.exec('reset role;');
    }
  });

  it('rejects privilege injection and invalid dates at the database boundary', async () => {
    await expect(
      db.query(
        'select public.update_customer_profile(\'existing-customer\', \'{"role":"admin"}\'::jsonb)',
      ),
    ).rejects.toThrow('Invalid profile fields');
    await expect(
      db.query(
        'select public.update_customer_profile(\'existing-customer\', \'{"birthDate":"1990-02-31"}\'::jsonb)',
      ),
    ).rejects.toThrow();
    const result = await db.query(
      "select display_name from public.users where id='existing-customer'",
    );
    expect(result.rows[0].display_name).toBe('Existing customer');
  });

  it('lets the service role use only the confirmed immutable identity', async () => {
    await db.exec('begin; set local role service_role;');
    try {
      const result = await db.query(
        "select public.provision_customer_account('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa','existing@example.invalid','Do not overwrite','ar') as id",
      );
      expect(result.rows[0].id).toBe('existing-customer');
    } finally {
      await db.exec('rollback;');
    }
    expect(
      (await db.query('select count(*)::int as count from public.customer_profiles')).rows[0].count,
    ).toBe(0);
  });
});
