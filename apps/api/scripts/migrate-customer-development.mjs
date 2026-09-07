#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';

export const DEVELOPMENT_REF = 'acomtixjibgkauzeltsn';
const PRODUCTION_REF = 'pacpdxvujkjvnaeeuute';
const MIGRATION = '0024_customer_accounts_library.sql';
const REVIEWED_SHA256 = '1cd0cb196fa4f1d99034255b99f0b14ca83ac87f1df5e4c16a0650e7b1f59a32';
const apiDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function developmentConnection(input) {
  if (!input || input.includes(PRODUCTION_REF))
    throw new Error('A development-only database URL is required');
  const url = new URL(input);
  const user = decodeURIComponent(url.username);
  const direct = url.hostname === `db.${DEVELOPMENT_REF}.supabase.co` && user === 'postgres';
  const pooler =
    /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(url.hostname) &&
    user === `postgres.${DEVELOPMENT_REF}`;
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    (!direct && !pooler) ||
    (url.port && url.port !== '5432') ||
    url.pathname !== '/postgres' ||
    !url.password ||
    [...url.searchParams.keys()].some((key) => key !== 'sslmode') ||
    (url.searchParams.has('sslmode') &&
      !['require', 'verify-full'].includes(url.searchParams.get('sslmode')))
  ) {
    throw new Error(
      'URL must identify the exact development project on PostgreSQL/session-pooler port 5432 with TLS',
    );
  }
  return {
    PGHOST: url.hostname,
    PGPORT: '5432',
    PGUSER: user,
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: 'postgres',
    PGSSLMODE: url.searchParams.get('sslmode') ?? 'require',
    PGCONNECT_TIMEOUT: '15',
  };
}

function run(binary, args, env, input) {
  const result = spawnSync(binary, args, {
    env,
    input,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120000,
  });
  if (result.error || result.status !== 0) {
    // Do not print provider stderr, which may echo connection credentials.
    throw new Error(
      `${binary.split('/').at(-1)} failed (exit ${result.status ?? 'unknown'}). No credentials were logged.`,
    );
  }
  return result.stdout;
}

const stateSql = `select json_build_object(
  'database', current_database(),
  'ledger', (select coalesce(json_agg(filename order by filename), '[]') from public.schema_migrations),
  'tables', (select coalesce(json_agg(tablename order by tablename), '[]') from pg_tables
    where schemaname='public' and tablename in ('customer_profiles','customer_libraries')),
  'counts', json_build_object(
    'users', (select count(*) from public.users), 'studioMembers', (select count(*) from public.studio_members),
    'episodes', (select count(*) from public.episodes), 'articles', (select count(*) from public.articles),
    'follows', (select count(*) from public.follows), 'progress', (select count(*) from public.playback_progress),
    'subscriptions', (select count(*) from public.subscriptions)))::text;`;

const verificationSql = `do $$ declare signature text; relation text; begin
  foreach relation in array array['customer_profiles','customer_libraries'] loop
    if not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=relation and c.relrowsecurity) then
      raise exception 'Private table RLS missing'; end if;
    if exists(select 1 from pg_policies where schemaname='public' and tablename=relation) then
      raise exception 'Unexpected direct-client policy'; end if;
    if has_table_privilege('anon','public.'||relation,'SELECT,INSERT,UPDATE,DELETE')
      or has_table_privilege('authenticated','public.'||relation,'SELECT,INSERT,UPDATE,DELETE') then
      raise exception 'Browser table privileges present'; end if;
  end loop;
  foreach signature in array array['public.provision_customer_account(uuid,text,text,text)',
    'public.update_customer_profile(text,jsonb)','public.clear_customer_library(text)'] loop
    if has_function_privilege('anon',signature,'EXECUTE')
      or has_function_privilege('authenticated',signature,'EXECUTE')
      or not has_function_privilege('service_role',signature,'EXECUTE') then
      raise exception 'Customer RPC privilege boundary failed'; end if;
  end loop;
end $$;`;

/** Transactional smoke records are synthetic and always rolled back; no email is sent. */
export const smokeSql = `begin;
do $$ declare auth_id uuid := gen_random_uuid(); v_customer_id text; again text; test_email text; begin
  test_email := 'customer-migration-' || auth_id::text || '@example.invalid';
  insert into auth.users(id,email,email_confirmed_at,aud,role)
    values(auth_id,test_email,now(),'authenticated','authenticated');
  v_customer_id := public.provision_customer_account(auth_id,test_email,'Migration test','ar');
  again := public.provision_customer_account(auth_id,test_email,'Must not replace','ar');
  if v_customer_id <> again or (select display_name from public.users where id=v_customer_id) <> 'Migration test'
    or exists(select 1 from public.studio_members where auth_user_id=auth_id) then
    raise exception 'Identity isolation/idempotency failed'; end if;
  begin
    perform public.provision_customer_account(auth_id,'forged@example.invalid','No','ar');
    raise exception 'Forged email unexpectedly accepted';
  exception when insufficient_privilege then null; end;
  perform public.update_customer_profile(v_customer_id,'{"gender":"female","birthDate":"1990-02-28","interests":["كتب"],"onboarded":true}'::jsonb);
  if not exists(select 1 from public.customer_profiles p where p.user_id=v_customer_id and p.onboarded and p.birth_date=date '1990-02-28') then
    raise exception 'Profile update failed'; end if;
  perform public.clear_customer_library(v_customer_id);
  perform public.clear_customer_library(v_customer_id);
  if (select revision from public.customer_libraries l where l.user_id=v_customer_id) <> 1 then
    raise exception 'Clear revision protection failed'; end if;
end $$;
rollback;`;

export function main(args = process.argv.slice(2)) {
  const value = (flag) => args[args.indexOf(flag) + 1];
  const known = new Set(['--env-file', '--backup-dir', '--pg-bin', '--apply']);
  for (let index = 0; index < args.length; index++) {
    if (!known.has(args[index])) throw new Error('Unsupported argument');
    if (args[index] !== '--apply') {
      if (!args[index + 1] || args[index + 1].startsWith('--'))
        throw new Error('Missing flag value');
      index++;
    }
  }
  if (!args.includes('--env-file'))
    throw new Error('Supply --env-file with MUKHTALIF_DEVELOPMENT_DB_URL');
  const source = parseEnv(readFileSync(value('--env-file'), 'utf8'));
  if (source.SUPABASE_URL && source.SUPABASE_URL !== `https://${DEVELOPMENT_REF}.supabase.co`) {
    throw new Error('Supplied environment is not the development project');
  }
  const connection = developmentConnection(source.MUKHTALIF_DEVELOPMENT_DB_URL);
  const env = { ...process.env, ...connection };
  const binaryDir = args.includes('--pg-bin') ? value('--pg-bin') : '/opt/homebrew/opt/libpq/bin';
  const sql = (query) =>
    run(join(binaryDir, 'psql'), ['-X', '-At', '-v', 'ON_ERROR_STOP=1'], env, query);
  const migration = readFileSync(join(apiDirectory, 'supabase/migrations', MIGRATION), 'utf8');
  const sha = createHash('sha256').update(migration).digest('hex');
  if (sha !== REVIEWED_SHA256)
    throw new Error(
      'Migration differs from the reviewed SHA-256; review it before updating this guard',
    );
  const before = JSON.parse(sql(stateSql));
  if (before.database !== 'postgres' || !before.ledger.includes('0023_episode_youtube.sql')) {
    throw new Error('Development schema preflight failed: migration 0023 must already be recorded');
  }
  if (before.ledger.includes(MIGRATION)) {
    sql(verificationSql);
    console.log(
      JSON.stringify({
        status: 'already_applied',
        projectRef: DEVELOPMENT_REF,
        counts: before.counts,
      }),
    );
    return;
  }
  if (before.tables.length)
    throw new Error('Customer schema exists without its ledger entry; reconcile before proceeding');
  if (!args.includes('--apply')) {
    console.log(
      JSON.stringify({
        status: 'ready',
        projectRef: DEVELOPMENT_REF,
        migration: MIGRATION,
        sha256: sha,
        counts: before.counts,
      }),
    );
    return;
  }
  if (
    !args.includes('--backup-dir') ||
    !isAbsolute(value('--backup-dir')) ||
    existsSync(value('--backup-dir'))
  ) {
    throw new Error('Apply requires a new absolute --backup-dir outside Git');
  }
  const backup = value('--backup-dir');
  if (backup.startsWith(resolve(apiDirectory, '../..') + '/'))
    throw new Error('Backups must be outside the repository');
  process.umask(0o077);
  mkdirSync(backup, { recursive: true, mode: 0o700 });
  const dump = join(backup, 'before-full.dump');
  run(join(binaryDir, 'pg_dump'), ['--format=custom', '--file', dump], env);
  chmodSync(dump, 0o600);
  const toc = run(join(binaryDir, 'pg_restore'), ['--list', dump], env);
  for (const required of [
    'TABLE DATA auth users',
    'TABLE DATA public users',
    'TABLE DATA public episodes',
  ]) {
    if (!toc.includes(required))
      throw new Error('Full backup table-of-contents verification failed');
  }
  const persist = (name, contents) => writeFileSync(join(backup, name), contents, { mode: 0o600 });
  persist('before-full.toc', toc);
  persist('before.json', JSON.stringify(before, null, 2));
  persist(MIGRATION, migration);
  const body = migration.replace(/^([\s\S]*?)\bbegin;\s*/i, '$1').replace(/commit;\s*$/i, '');
  const quoted = MIGRATION.replaceAll("'", "''");
  sql(`begin; set local lock_timeout='10s'; set local statement_timeout='120s';
    select pg_advisory_xact_lock(242024);
    ${body}
    insert into public.schema_migrations(filename) values ('${quoted}');
    ${verificationSql}
    commit;`);
  sql(smokeSql);
  const after = JSON.parse(sql(stateSql));
  if (JSON.stringify(after.counts) !== JSON.stringify(before.counts))
    throw new Error('Existing row counts changed during migration; inspect the protected backup');
  const receipt = {
    status: 'applied_and_verified',
    projectRef: DEVELOPMENT_REF,
    migration: MIGRATION,
    migrationSha256: sha,
    dumpSha256: createHash('sha256').update(readFileSync(dump)).digest('hex'),
    counts: after.counts,
    verifiedAt: new Date().toISOString(),
    backupDirectory: backup,
  };
  persist('receipt.json', JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Migration failed');
    process.exitCode = 1;
  }
}
