-- DEVELOPMENT ONLY: acomtixjibgkauzeltsn. Use a verified development connection.
-- Requires a fresh full custom-format database/Auth backup with verified TOC.
-- Records historical migration 0023 only; does not rerun its DDL or change data.
-- Reviewed migration SHA-256: bf2a916852f20fb5304ac2c73cda564d5ff31635fe9fbfde4f16b23f003628c9
begin;
set local lock_timeout = '10s';
set local statement_timeout = '30s';
do $connection_guard$
begin
  if current_database() <> 'postgres' or current_user <> 'postgres'
    or session_user not in ('postgres', 'cli_login_postgres') then
    raise exception 'Expected independently verified development postgres connection';
  end if;
end;
$connection_guard$;
-- Block competing ledger writes and DDL/comment changes during verification.
lock table public.schema_migrations in share row exclusive mode;
lock table public.episodes in share update exclusive mode;
do $verify_0023$
declare
  column_state record;
  constraint_state record;
begin
  select a.*, col_description(a.attrelid, a.attnum) as column_comment
    into column_state
    from pg_attribute a
    where a.attrelid = to_regclass('public.episodes')
      and a.attname = 'youtube_video_id' and not a.attisdropped;
  if not found then
    raise exception '0023 verification failed: YouTube column missing';
  end if;
  if column_state.atttypid <> 'pg_catalog.text'::regtype
    or column_state.atttypmod <> -1 or column_state.attnotnull
    or column_state.atthasdef or column_state.attidentity <> ''
    or column_state.attgenerated <> ''
    or column_state.attcollation <> (select typcollation from pg_type where oid = 'pg_catalog.text'::regtype)
  then
    raise exception '0023 verification failed: YouTube column definition differs';
  end if;
  if column_state.column_comment is distinct from
    'Verified full-episode YouTube ID. Nullable; never a trailer, guessed match, or arbitrary embed URL.'
  then
    raise exception '0023 verification failed: YouTube comment differs';
  end if;

  select c.*, pg_get_constraintdef(c.oid) as definition
    into constraint_state
    from pg_constraint c
    where c.conrelid = to_regclass('public.episodes')
      and c.conname = 'episodes_youtube_video_id_format';
  if not found then
    raise exception '0023 verification failed: YouTube constraint missing';
  end if;
  if constraint_state.contype <> 'c' or not constraint_state.convalidated
    or constraint_state.connoinherit or not constraint_state.conislocal
    or constraint_state.coninhcount <> 0 or constraint_state.conparentid <> 0
    or constraint_state.conkey is distinct from array[column_state.attnum]::smallint[]
    or constraint_state.definition is distinct from
      $definition$CHECK (((youtube_video_id IS NULL) OR (youtube_video_id ~ '^[A-Za-z0-9_-]{11}$'::text)))$definition$
  then
    raise exception '0023 verification failed: YouTube constraint differs';
  end if;
end;
$verify_0023$;

do $ledger_guard$
begin
  if exists(select 1 from public.schema_migrations where filename = '0023_episode_youtube.sql') then
    raise exception '0023 ledger entry already exists; no reconciliation required';
  end if;
  if not exists(select 1 from public.schema_migrations where filename = '0022_homepage_weekly_episodes.sql') then
    raise exception '0022 ledger prerequisite missing';
  end if;
end;
$ledger_guard$;
insert into public.schema_migrations(filename) values ('0023_episode_youtube.sql') returning filename;
commit;
