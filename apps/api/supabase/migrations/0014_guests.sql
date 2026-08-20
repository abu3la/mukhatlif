-- Guests are Studio-managed editorial people who appear in episodes. A guest is
-- neither an application user nor a Studio member and carries no authentication
-- state. Only the Worker service role reaches these tables; the browser reads
-- guests through Hono, never through PostgREST.

create table public.guests (
  id text primary key default ('gst-' || substr(gen_random_uuid()::text, 1, 8)),
  slug text not null unique,
  name text not null default '',
  role text not null default '',
  city text not null default '',
  email text not null default '',
  bio text not null default '',
  photo_url text,
  created_at timestamptz not null default now(),
  constraint guests_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint guests_name_check check (char_length(name) <= 160),
  constraint guests_role_check check (char_length(role) <= 160),
  constraint guests_city_check check (char_length(city) <= 120),
  -- Empty is the "not filled in yet" value; anything else must be an address.
  constraint guests_email_check check (
    email = '' or (email = lower(btrim(email)) and char_length(email) between 3 and 254)
  ),
  constraint guests_bio_check check (char_length(bio) <= 4000),
  constraint guests_photo_url_check check (photo_url is null or char_length(photo_url) <= 2048)
);

create index guests_created_at_idx on public.guests (created_at desc);
create index guests_name_idx on public.guests (lower(name));

create table public.guest_socials (
  id text primary key default ('gsoc-' || substr(gen_random_uuid()::text, 1, 8)),
  guest_id text not null references public.guests (id) on delete cascade,
  platform text not null,
  handle text not null,
  created_at timestamptz not null default now(),
  constraint guest_socials_platform_check check (
    platform in ('x', 'linkedin', 'instagram', 'youtube', 'website')
  ),
  constraint guest_socials_handle_check check (char_length(btrim(handle)) between 1 and 200)
);

create index guest_socials_guest_idx on public.guest_socials (guest_id);

-- One link per platform per guest keeps the profile card unambiguous.
create unique index guest_socials_guest_platform_unique
  on public.guest_socials (guest_id, platform);

create table public.guest_appearances (
  guest_id text not null references public.guests (id) on delete cascade,
  episode_id text not null references public.episodes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (guest_id, episode_id)
);

create index guest_appearances_episode_idx on public.guest_appearances (episode_id);

comment on table public.guests is
  'Studio-managed editorial guest records. Never an authentication subject.';
comment on table public.guest_appearances is
  'Many-to-many link between a guest and the episodes they appear in.';

alter table public.guests enable row level security;
alter table public.guest_socials enable row level security;
alter table public.guest_appearances enable row level security;

revoke all on table public.guests from anon, authenticated, service_role;
revoke all on table public.guest_socials from anon, authenticated, service_role;
revoke all on table public.guest_appearances from anon, authenticated, service_role;

grant select, insert, update, delete on table public.guests to service_role;
grant select, insert, update, delete on table public.guest_socials to service_role;
grant select, insert, update, delete on table public.guest_appearances to service_role;
