-- Immutable WordPress provenance lets the offline importer reconcile a changed
-- source without overwriting a newer Studio edit. The raw WXR remains in the
-- private backup; only sanitized legacy HTML and checksums enter Postgres.

alter table public.articles
  add column legacy_source_id text references public.legacy_import_sources (id) on delete restrict,
  add column legacy_post_id bigint,
  add column legacy_source_url text,
  add column legacy_content_html text,
  add column legacy_source_checksum_sha256 text,
  add column legacy_source_updated_at timestamptz,
  add column legacy_imported_at timestamptz,
  add constraint articles_legacy_provenance_check check (
    (
      legacy_source_id is null
      and legacy_post_id is null
      and legacy_source_url is null
      and legacy_content_html is null
      and legacy_source_checksum_sha256 is null
      and legacy_source_updated_at is null
      and legacy_imported_at is null
    )
    or (
      legacy_source_id is not null
      and legacy_post_id is not null
      and legacy_post_id > 0
      and legacy_content_html is not null
      and legacy_source_checksum_sha256 ~ '^[0-9a-f]{64}$'
      and legacy_imported_at is not null
    )
  ),
  add constraint articles_legacy_source_url_check check (
    legacy_source_url is null or char_length(legacy_source_url) <= 4096
  );

create unique index articles_legacy_source_post_unique_idx
  on public.articles (legacy_source_id, legacy_post_id)
  where legacy_source_id is not null and legacy_post_id is not null;

comment on column public.articles.legacy_content_html is
  'Sanitized WordPress source snapshot. content_json remains the canonical editable document.';
comment on column public.articles.legacy_source_checksum_sha256 is
  'Per-post WXR checksum used by the importer conflict guard.';
