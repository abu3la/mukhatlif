-- One Studio-managed presentation setting for the public home page. Episode
-- membership is always derived from published episodes in the trailing 7 days;
-- editors cannot curate a hidden second list here.

begin;

create table public.homepage_weekly_episode_settings (
  id smallint primary key default 1,
  enabled boolean not null default true,
  title text not null default 'حلقات آخر أسبوع من مختلف',
  window_days smallint not null default 7,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  constraint homepage_weekly_episode_settings_singleton_check check (id = 1),
  constraint homepage_weekly_episode_settings_title_check check (
    title = btrim(title) and char_length(title) between 1 and 80
  ),
  constraint homepage_weekly_episode_settings_window_check check (window_days = 7),
  constraint homepage_weekly_episode_settings_version_check check (version >= 1)
);

insert into public.homepage_weekly_episode_settings (id)
values (1);

comment on table public.homepage_weekly_episode_settings is
  'Singleton presentation settings. Public episode membership remains derived from published_at.';

alter table public.homepage_weekly_episode_settings enable row level security;

revoke all on table public.homepage_weekly_episode_settings
  from anon, authenticated, service_role;
grant select, update on table public.homepage_weekly_episode_settings
  to service_role;

commit;
