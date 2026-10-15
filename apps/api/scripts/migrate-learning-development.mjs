#!/usr/bin/env node
/** Additive learning migration. Pinned development connection and verified backup required. */
import { readFileSync, writeFileSync, mkdirSync, existsSync, chmodSync } from 'node:fs';
import { resolve, join, isAbsolute } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { developmentConnection, DEVELOPMENT_REF } from './migrate-customer-development.mjs';
const args = process.argv.slice(2),
  get = (name) => args[args.indexOf(name) + 1];
const migration = readFileSync(
  new URL('../supabase/migrations/0025_learning.sql', import.meta.url),
  'utf8',
);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const fingerprint = `select jsonb_build_object('auth', (select md5(coalesce(string_agg(row_to_json(t)::text,'' order by id),'')) from auth.users t),'users',(select md5(coalesce(string_agg(row_to_json(t)::text,'' order by id),'')) from public.users t),'articles',(select md5(coalesce(string_agg(row_to_json(t)::text,'' order by id),'')) from public.articles t),'episodes',(select md5(coalesce(string_agg(row_to_json(t)::text,'' order by id),'')) from public.episodes t))::text;`;
try {
  if (!args.includes('--env-file'))
    throw Error('Supply --env-file with MUKHTALIF_DEVELOPMENT_DB_URL.');
  const source = parseEnv(readFileSync(get('--env-file'), 'utf8'));
  const connection = developmentConnection(source.MUKHTALIF_DEVELOPMENT_DB_URL, {
    cliLoginRole: args.includes('--cli-login-role'),
  });
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))),
    ...connection,
  };
  const bin = args.includes('--pg-bin') ? get('--pg-bin') : '/opt/homebrew/opt/libpq/bin';
  const run = (name, argv, input) => {
    const r = spawnSync(join(bin, name), argv, {
      env,
      input,
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 64 * 1024 * 1024,
    });
    if (r.status !== 0)
      throw Error(`${name} failed; provider output withheld to protect credentials.`);
    return r.stdout;
  };
  const sql = (input) => run('psql', ['-XAt', '-v', 'ON_ERROR_STOP=1'], input).trim();
  if (
    sql(
      "select exists(select 1 from public.schema_migrations where filename='0024_customer_accounts_library.sql');",
    ) !== 't'
  )
    throw Error('Customer schema prerequisite missing.');
  if (
    sql(
      "select exists(select 1 from public.schema_migrations where filename='0025_learning.sql');",
    ) === 't'
  ) {
    console.log('Learning migration already recorded. No mutation performed.');
    process.exit(0);
  }
  if (
    sql(
      "select count(*) from pg_tables where schemaname='public' and tablename like 'learning_%';",
    ) !== '0'
  )
    throw Error('Partial learning schema exists; inspect before applying.');
  if (!args.includes('--apply')) {
    console.log(
      JSON.stringify({
        project: DEVELOPMENT_REF,
        status: 'preflight_passed',
        migrationSha256: hash(migration),
      }),
    );
    process.exit(0);
  }
  const backup = get('--backup-dir');
  if (
    !args.includes('--backup-dir') ||
    !isAbsolute(backup) ||
    existsSync(backup) ||
    resolve(backup).startsWith(resolve(fileURLToPath(new URL('../../../', import.meta.url))))
  )
    throw Error('Use a new absolute backup directory outside this checkout.');
  mkdirSync(backup, { mode: 0o700, recursive: true });
  const dump = join(backup, 'before-full.dump');
  run('pg_dump', ['--format=custom', '--file', dump]);
  chmodSync(dump, 0o600);
  const toc = run('pg_restore', ['--list', dump]);
  if (!toc.includes('TABLE auth users') || !toc.includes('TABLE public episodes'))
    throw Error('Backup verification failed.');
  const before = sql(fingerprint);
  writeFileSync(join(backup, 'before.json'), before, { mode: 0o600 });
  writeFileSync(join(backup, '0025_learning.sql'), migration, { mode: 0o600 });
  sql(migration);
  sql(
    `do $$ declare t text; begin foreach t in array array['learning_courses','learning_enrollments','learning_assets','learning_media_tickets'] loop if has_table_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated','public.'||t,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'Browser access present'; end if; if not exists(select 1 from pg_class where oid=('public.'||t)::regclass and relrowsecurity) then raise exception 'RLS missing'; end if; end loop; end $$;`,
  );
  const after = sql(fingerprint);
  if (before !== after)
    throw Error(
      'Existing data changed during migration window. Inspect backup and concurrent writes before proceeding.',
    );
  const receipt = {
    project: DEVELOPMENT_REF,
    status: 'applied_and_verified',
    migrationSha256: hash(migration),
    dumpSha256: hash(readFileSync(dump)),
    existingDataUnchanged: true,
    verifiedAt: new Date().toISOString(),
  };
  writeFileSync(join(backup, 'receipt.json'), JSON.stringify(receipt, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(receipt));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
