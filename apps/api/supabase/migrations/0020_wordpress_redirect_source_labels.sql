-- The development database applied an earlier 0016 revision whose redirect
-- label constraint omitted the canonical WordPress route produced by the
-- reviewed importer. Preserve migration history and widen only that known
-- constraint; refuse to run if the live definition has drifted again.

begin;

do $migration$
declare
  current_definition text;
  old_definition constant text :=
    'CHECK ((source_label = ANY (ARRAY[''manual''::text, ''wordpress-old-slug''::text, ''wordpress-redirection''::text])))';
  desired_definition constant text :=
    'CHECK ((source_label = ANY (ARRAY[''manual''::text, ''wordpress-canonical''::text, ''wordpress-old-slug''::text, ''wordpress-redirection''::text])))';
begin
  select pg_get_constraintdef(constraint_row.oid)
    into current_definition
    from pg_constraint as constraint_row
   where constraint_row.conrelid = 'public.url_redirects'::regclass
     and constraint_row.conname = 'url_redirects_source_label_check'
     and constraint_row.contype = 'c'
     and constraint_row.convalidated;

  if current_definition = desired_definition then
    return;
  end if;

  if current_definition is distinct from old_definition then
    raise exception using
      message = 'Unexpected url_redirects_source_label_check definition',
      detail = coalesce(current_definition, '<missing>'),
      hint = 'Inspect the live schema and create a new reviewed migration instead of weakening an unknown constraint.';
  end if;

  alter table public.url_redirects
    drop constraint url_redirects_source_label_check;

  alter table public.url_redirects
    add constraint url_redirects_source_label_check check (
      source_label in (
        'manual',
        'wordpress-canonical',
        'wordpress-old-slug',
        'wordpress-redirection'
      )
    );
end
$migration$;

commit;
