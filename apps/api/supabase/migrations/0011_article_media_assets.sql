-- Private metadata for sanitized article images stored in the MEDIA R2 bucket.
-- Only the Worker service role accesses this table; public bytes are served by
-- GET /media/:id after the row reaches the immutable `ready` state.

create table public.article_media_assets (
  id text primary key,
  kind text not null default 'image',
  mime_type text not null,
  original_file_name text not null,
  storage_key text not null unique,
  byte_size integer not null,
  expected_byte_size integer not null,
  width integer not null,
  height integer not null,
  default_alt text not null,
  default_caption text,
  status text not null default 'pending',
  upload_started_at timestamptz,
  upload_token uuid,
  created_at timestamptz not null default now(),
  constraint article_media_assets_id_check check (id ~ '^med-[0-9a-f]{32}$'),
  constraint article_media_assets_kind_check check (kind = 'image'),
  constraint article_media_assets_mime_check check (mime_type in ('image/jpeg', 'image/png')),
  constraint article_media_assets_file_name_check check (
    char_length(trim(original_file_name)) between 1 and 160
  ),
  constraint article_media_assets_size_check check (
    byte_size between 1 and 10485760
    and expected_byte_size between 1 and 10485760
  ),
  constraint article_media_assets_dimensions_check check (
    width between 1 and 8192
    and height between 1 and 8192
    and width::bigint * height::bigint <= 24000000
  ),
  constraint article_media_assets_alt_check check (
    char_length(trim(default_alt)) between 1 and 500
  ),
  constraint article_media_assets_caption_check check (
    default_caption is null
    or char_length(trim(default_caption)) between 1 and 1000
  ),
  constraint article_media_assets_status_check check (
    status in ('pending', 'uploading', 'ready')
  ),
  constraint article_media_assets_upload_lease_check check (
    (status = 'uploading' and upload_started_at is not null and upload_token is not null)
    or (status <> 'uploading' and upload_started_at is null and upload_token is null)
  )
);

create index article_media_assets_ready_created_idx
  on public.article_media_assets (created_at desc)
  where status = 'ready';

create index article_media_assets_uploading_idx
  on public.article_media_assets (upload_started_at)
  where status = 'uploading';

alter table public.article_media_assets enable row level security;
revoke all on table public.article_media_assets from anon, authenticated, service_role;
grant select, insert, update, delete on table public.article_media_assets to service_role;
