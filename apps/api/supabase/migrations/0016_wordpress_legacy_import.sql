-- Target model for the reviewed WordPress WXR and podcast RSS migration.
-- This migration defines storage only. The offline importer never executes SQL.

-- Existing shows are public today, so the default keeps current API behaviour.
create type public.show_lifecycle_status as enum ('draft', 'published', 'archived');

alter table public.shows
  add column status public.show_lifecycle_status not null default 'published',
  add column rss_url text,
  add column spotify_url text,
  add column apple_podcasts_url text,
  add column youtube_url text,
  add constraint shows_rss_url_check check (
    rss_url is null or (char_length(rss_url) <= 2048 and rss_url ~ '^https://')
  ),
  add constraint shows_spotify_url_check check (
    spotify_url is null or (char_length(spotify_url) <= 2048 and spotify_url ~ '^https://')
  ),
  add constraint shows_apple_podcasts_url_check check (
    apple_podcasts_url is null
    or (char_length(apple_podcasts_url) <= 2048 and apple_podcasts_url ~ '^https://')
  ),
  add constraint shows_youtube_url_check check (
    youtube_url is null or (char_length(youtube_url) <= 2048 and youtube_url ~ '^https://')
  );

create index shows_status_idx on public.shows (status);

alter table public.episodes
  add column rss_guid text,
  add column legacy_url text,
  add column source_url text,
  add column artwork_url text,
  add constraint episodes_rss_guid_check check (
    rss_guid is null or char_length(btrim(rss_guid)) between 1 and 2048
  ),
  add constraint episodes_legacy_url_check check (
    legacy_url is null or char_length(legacy_url) <= 2048
  ),
  add constraint episodes_source_url_check check (
    source_url is null or char_length(source_url) <= 4096
  ),
  add constraint episodes_artwork_url_check check (
    artwork_url is null or char_length(artwork_url) <= 2048
  );

create unique index episodes_rss_guid_unique_idx
  on public.episodes (rss_guid)
  where rss_guid is not null;

-- Public editorial identities are separate from listeners, Studio accounts,
-- and guests. WordPress authors and team members can be reconciled into one
-- person later without coupling identity to authentication.
create table public.people (
  id text primary key default ('per-' || substr(gen_random_uuid()::text, 1, 8)),
  slug text not null unique,
  display_name text not null,
  first_name text,
  last_name text,
  role_title text,
  bio_html text not null default '',
  image_url text,
  social_links jsonb not null default '{}'::jsonb,
  visibility text not null default 'public',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint people_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint people_display_name_check check (
    char_length(btrim(display_name)) between 2 and 160
  ),
  constraint people_first_name_check check (
    first_name is null or char_length(btrim(first_name)) between 1 and 100
  ),
  constraint people_last_name_check check (
    last_name is null or char_length(btrim(last_name)) between 1 and 100
  ),
  constraint people_role_title_check check (
    role_title is null or char_length(btrim(role_title)) between 1 and 160
  ),
  constraint people_image_url_check check (
    image_url is null or char_length(image_url) <= 2048
  ),
  constraint people_social_links_check check (jsonb_typeof(social_links) = 'object'),
  constraint people_visibility_check check (visibility in ('public', 'private'))
);

create index people_visibility_name_idx on public.people (visibility, display_name);

-- A byline is snapshotted so a later name change does not rewrite history.
-- Existing articles continue to use their current author columns until each
-- article is explicitly reconciled during import.
create table public.article_authors (
  article_id text not null references public.articles (id) on delete cascade,
  person_id text not null references public.people (id) on delete restrict,
  position smallint not null default 0,
  display_name_snapshot text not null,
  created_at timestamptz not null default now(),
  primary key (article_id, person_id),
  constraint article_authors_position_check check (position between 0 and 20),
  constraint article_authors_display_name_check check (
    char_length(btrim(display_name_snapshot)) between 2 and 160
  ),
  unique (article_id, position)
);

create index article_authors_person_idx on public.article_authors (person_id);

create table public.books (
  id text primary key default ('book-' || substr(gen_random_uuid()::text, 1, 8)),
  slug text not null unique,
  title_ar text not null,
  summary_html text not null default '',
  cover_url text,
  cover_alt text,
  discussed_with_person_id text references public.people (id) on delete set null,
  discussed_with_name_snapshot text,
  related_episode_url text,
  status public.article_status not null default 'draft',
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint books_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint books_title_check check (char_length(btrim(title_ar)) between 1 and 240),
  constraint books_cover_url_check check (cover_url is null or char_length(cover_url) <= 2048),
  constraint books_cover_alt_check check (
    cover_url is null or (cover_alt is not null and char_length(btrim(cover_alt)) between 1 and 500)
  ),
  constraint books_discussed_with_name_check check (
    discussed_with_name_snapshot is null
    or char_length(btrim(discussed_with_name_snapshot)) between 2 and 160
  ),
  constraint books_related_episode_url_check check (
    related_episode_url is null or char_length(related_episode_url) <= 2048
  ),
  constraint books_publication_check check (
    (status = 'published' and published_at is not null)
    or (status = 'draft' and published_at is null)
  )
);

create index books_status_published_idx on public.books (status, published_at desc);

-- One source row identifies one immutable export/feed revision. A changed
-- checksum is represented by updating the same source ledger before another
-- idempotent reconciliation run.
create table public.legacy_import_sources (
  id text primary key,
  source_kind text not null,
  source_url text not null,
  source_checksum_sha256 text not null,
  manifest_checksum_sha256 text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint legacy_import_sources_id_check check (
    char_length(btrim(id)) between 3 and 160
  ),
  constraint legacy_import_sources_kind_check check (
    source_kind in ('wordpress_wxr', 'podcast_rss')
  ),
  constraint legacy_import_sources_url_check check (
    char_length(btrim(source_url)) between 1 and 4096
  ),
  constraint legacy_import_sources_checksum_check check (
    source_checksum_sha256 ~ '^[0-9a-f]{64}$'
    and (
      manifest_checksum_sha256 is null
      or manifest_checksum_sha256 ~ '^[0-9a-f]{64}$'
    )
  )
);

create table public.legacy_import_records (
  id bigint generated always as identity primary key,
  source_id text not null references public.legacy_import_sources (id) on delete restrict,
  entity_type text not null,
  legacy_key text not null,
  legacy_numeric_id bigint,
  legacy_slug text,
  legacy_url text,
  target_kind text,
  target_id text,
  source_checksum_sha256 text not null,
  import_status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  imported_at timestamptz,
  last_seen_at timestamptz not null default now(),
  constraint legacy_import_records_entity_type_check check (
    entity_type in ('post', 'page', 'team_member', 'book', 'attachment', 'author', 'show', 'episode')
  ),
  constraint legacy_import_records_key_check check (
    char_length(btrim(legacy_key)) between 1 and 2048
  ),
  constraint legacy_import_records_target_kind_check check (
    target_kind is null
    or target_kind in ('article', 'page', 'person', 'book', 'media', 'show', 'episode', 'none')
  ),
  constraint legacy_import_records_checksum_check check (
    source_checksum_sha256 ~ '^[0-9a-f]{64}$'
  ),
  constraint legacy_import_records_status_check check (
    import_status in ('pending', 'imported', 'skipped', 'failed')
  ),
  constraint legacy_import_records_metadata_check check (jsonb_typeof(metadata) = 'object'),
  constraint legacy_import_records_imported_at_check check (
    (import_status = 'imported' and imported_at is not null and target_id is not null)
    or (import_status <> 'imported' and imported_at is null)
  ),
  unique (source_id, entity_type, legacy_key)
);

create index legacy_import_records_target_idx
  on public.legacy_import_records (target_kind, target_id)
  where target_id is not null;
create index legacy_import_records_pending_idx
  on public.legacy_import_records (source_id, import_status);

create table public.url_redirects (
  id bigint generated always as identity primary key,
  source_path text not null unique,
  destination text not null,
  status_code smallint not null default 301,
  is_active boolean not null default true,
  legacy_import_record_id bigint references public.legacy_import_records (id) on delete set null,
  source_label text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint url_redirects_source_path_check check (
    source_path like '/%'
    and source_path !~ '#'
    and char_length(source_path) <= 4096
  ),
  constraint url_redirects_destination_check check (
    (destination like '/%' or destination ~ '^https://')
    and destination !~ '#'
    and char_length(destination) <= 4096
  ),
  constraint url_redirects_status_code_check check (status_code in (301, 302, 307, 308)),
  constraint url_redirects_no_self_loop_check check (source_path <> destination),
  constraint url_redirects_source_label_check check (
    source_label in (
      'manual',
      'wordpress-canonical',
      'wordpress-old-slug',
      'wordpress-redirection'
    )
  )
);

create index url_redirects_active_idx on public.url_redirects (source_path) where is_active;

comment on table public.legacy_import_sources is
  'Ledger for repeatable WXR/RSS imports. It stores checksums, never raw export secrets.';
comment on table public.legacy_import_records is
  'Idempotent legacy key to target ID mapping and per-record source checksum.';
comment on table public.url_redirects is
  'Reviewed exact-path redirects. Conflicts are resolved in the dry run before insertion.';

alter table public.people enable row level security;
alter table public.article_authors enable row level security;
alter table public.books enable row level security;
alter table public.legacy_import_sources enable row level security;
alter table public.legacy_import_records enable row level security;
alter table public.url_redirects enable row level security;

revoke all on table public.people from anon, authenticated, service_role;
revoke all on table public.article_authors from anon, authenticated, service_role;
revoke all on table public.books from anon, authenticated, service_role;
revoke all on table public.legacy_import_sources from anon, authenticated, service_role;
revoke all on table public.legacy_import_records from anon, authenticated, service_role;
revoke all on table public.url_redirects from anon, authenticated, service_role;

grant select, insert, update, delete on table public.people to service_role;
grant select, insert, update, delete on table public.article_authors to service_role;
grant select, insert, update, delete on table public.books to service_role;
grant select, insert, update, delete on table public.legacy_import_sources to service_role;
grant select, insert, update, delete on table public.legacy_import_records to service_role;
grant select, insert, update, delete on table public.url_redirects to service_role;

grant usage, select on sequence public.legacy_import_records_id_seq to service_role;
grant usage, select on sequence public.url_redirects_id_seq to service_role;
