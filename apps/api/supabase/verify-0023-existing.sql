-- READ ONLY: verify the complete DDL created by 0023_episode_youtube.sql.
-- Use only the independently verified development connection for
-- acomtixjibgkauzeltsn. Migration 0023 creates no index.
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

select '0023_episode_youtube.sql' as filename, true as ddl_verified,
  false as migration_creates_index,
  exists(select 1 from public.schema_migrations where filename = '0023_episode_youtube.sql') as ledger_recorded;
