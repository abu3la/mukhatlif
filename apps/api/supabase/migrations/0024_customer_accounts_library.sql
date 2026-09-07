-- Private customer profiles and libraries. No Studio membership, role or
-- permission is created or modified by these functions.
begin;

create table public.customer_profiles (
  user_id text primary key references public.users(id) on delete cascade,
  gender text check (gender in ('male', 'female', 'prefer_not_to_say')),
  birth_date date check (birth_date between date '1900-01-01' and current_date),
  interests text[] not null default '{}' check (cardinality(interests) <= 20),
  onboarded boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.customer_libraries (
  user_id text primary key references public.users(id) on delete cascade,
  document jsonb not null default '{"savedEpisodeIds":[],"savedArticleIds":[],"playlists":[],"bookmarks":[],"queueEpisodeIds":[]}'::jsonb,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now(),
  constraint customer_library_document_shape check (
    jsonb_typeof(document) = 'object'
    and document ?& array['savedEpisodeIds','savedArticleIds','playlists','bookmarks','queueEpisodeIds']
    and jsonb_typeof(document -> 'savedEpisodeIds') = 'array'
    and jsonb_typeof(document -> 'savedArticleIds') = 'array'
    and jsonb_typeof(document -> 'playlists') = 'array'
    and jsonb_typeof(document -> 'bookmarks') = 'array'
    and jsonb_typeof(document -> 'queueEpisodeIds') = 'array'
    and jsonb_array_length(document -> 'savedEpisodeIds') <= 2000
    and jsonb_array_length(document -> 'savedArticleIds') <= 2000
    and jsonb_array_length(document -> 'playlists') <= 100
    and jsonb_array_length(document -> 'bookmarks') <= 2000
    and jsonb_array_length(document -> 'queueEpisodeIds') <= 200
    and octet_length(document::text) <= 2097152
  )
);

comment on table public.customer_profiles is 'Private account details; API authenticates the immutable Auth ID and scopes every operation to its application user.';
comment on table public.customer_libraries is 'Private customer saves, playlists, bookmarks and queue. Revision compare-and-set protects concurrent device writes.';

alter table public.customer_profiles enable row level security;
alter table public.customer_libraries enable row level security;
-- Deliberately no anon/authenticated policies. Browser clients must use the API.
revoke all on public.customer_profiles, public.customer_libraries from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.customer_profiles, public.customer_libraries to service_role;

create function public.provision_customer_account(
  p_auth_user_id uuid, p_email text, p_display_name text, p_locale text
) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user_id text;
  v_email text;
begin
  if p_auth_user_id is null or p_display_name is null or char_length(btrim(p_display_name)) not between 1 and 100
    or p_locale is null or p_locale not in ('ar','en') then
    raise exception 'Invalid customer input' using errcode = '22023';
  end if;
  -- This repeats the API's verified identity check at the database boundary.
  select lower(btrim(email)) into v_email from auth.users
    where id = p_auth_user_id and email_confirmed_at is not null;
  if v_email is null or v_email is distinct from lower(btrim(p_email)) then
    raise exception 'Confirmed Auth identity required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_auth_user_id::text, 0));
  select id into v_user_id from public.users where auth_user_id = p_auth_user_id;
  if v_user_id is null then
    v_user_id := 'usr-' || gen_random_uuid()::text;
    -- Email alone never claims or links an existing application profile.
    -- The existing unique email constraint deliberately fails such a conflict.
    insert into public.users(id, auth_user_id, email, display_name, locale)
      values (v_user_id, p_auth_user_id, v_email, btrim(p_display_name), p_locale);
  else
    -- A completed Auth email change may refresh the same immutable identity.
    -- A conflict fails; it never links an unrelated profile by email.
    update public.users set email = v_email where id = v_user_id and email is distinct from v_email;
  end if;
  insert into public.customer_profiles(user_id) values (v_user_id) on conflict (user_id) do nothing;
  return v_user_id;
end;
$$;

create function public.update_customer_profile(p_user_id text, p_changes jsonb)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_interests text[];
  v_birth_date date;
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'object'
    or exists (select 1 from jsonb_object_keys(p_changes) as field(name)
      where name not in ('displayName','locale','gender','birthDate','interests','onboarded')) then
    raise exception 'Invalid profile fields' using errcode = '22023';
  end if;
  perform 1 from public.users where id = p_user_id for update;
  if not found then raise exception 'Customer not found' using errcode = '22023'; end if;
  if p_changes ? 'displayName' and (
    jsonb_typeof(p_changes->'displayName') <> 'string'
    or char_length(btrim(p_changes->>'displayName')) not between 1 and 100
  ) then raise exception 'Invalid name' using errcode = '22023'; end if;
  if p_changes ? 'locale' and (jsonb_typeof(p_changes->'locale') <> 'string'
    or p_changes->>'locale' not in ('ar','en')) then
    raise exception 'Invalid locale' using errcode = '22023';
  end if;
  if p_changes ? 'gender' and jsonb_typeof(p_changes->'gender') <> 'null'
    and (jsonb_typeof(p_changes->'gender') <> 'string'
      or p_changes->>'gender' not in ('male','female','prefer_not_to_say')) then
    raise exception 'Invalid gender' using errcode = '22023';
  end if;
  if p_changes ? 'onboarded' and jsonb_typeof(p_changes->'onboarded') <> 'boolean' then
    raise exception 'Invalid onboarding state' using errcode = '22023';
  end if;
  if p_changes ? 'birthDate' and jsonb_typeof(p_changes->'birthDate') <> 'null' then
    if jsonb_typeof(p_changes->'birthDate') <> 'string'
      or p_changes->>'birthDate' !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'Invalid birth date' using errcode = '22023';
    end if;
    v_birth_date := (p_changes->>'birthDate')::date;
    if v_birth_date not between date '1900-01-01' and current_date then
      raise exception 'Invalid birth date' using errcode = '22023';
    end if;
  end if;
  if p_changes ? 'interests' then
    if jsonb_typeof(p_changes->'interests') <> 'array' or jsonb_array_length(p_changes->'interests') > 20 then
      raise exception 'Invalid interests' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(p_changes->'interests') as item(value)
      where jsonb_typeof(value) <> 'string' or char_length(btrim(value #>> '{}')) not between 1 and 60) then
      raise exception 'Invalid interest' using errcode = '22023';
    end if;
    select coalesce(array_agg(value), '{}') into v_interests from jsonb_array_elements_text(p_changes->'interests');
  end if;
  update public.users set
    display_name = case when p_changes ? 'displayName' then btrim(p_changes->>'displayName') else display_name end,
    locale = case when p_changes ? 'locale' then p_changes->>'locale' else locale end
    where id = p_user_id;
  insert into public.customer_profiles(user_id) values (p_user_id) on conflict (user_id) do nothing;
  update public.customer_profiles set
    gender = case when p_changes ? 'gender' then p_changes->>'gender' else gender end,
    birth_date = case when p_changes ? 'birthDate' then v_birth_date else birth_date end,
    interests = case when p_changes ? 'interests' then v_interests else interests end,
    onboarded = case when p_changes ? 'onboarded' then (p_changes->>'onboarded')::boolean else onboarded end,
    updated_at = now()
    where user_id = p_user_id;
end;
$$;

create function public.clear_customer_library(p_user_id text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  -- Keep an increasing revision, so stale writers cannot pass an ABA revision
  -- check after a delete/recreate. This clears only the caller's library domain.
  insert into public.customer_libraries(user_id) values (p_user_id)
    on conflict (user_id) do update set
      document = excluded.document, revision = customer_libraries.revision + 1, updated_at = now();
  delete from public.follows where user_id = p_user_id;
  delete from public.playback_progress where user_id = p_user_id;
end;
$$;

revoke all on function public.provision_customer_account(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.update_customer_profile(text,jsonb) from public, anon, authenticated;
revoke all on function public.clear_customer_library(text) from public, anon, authenticated;
grant execute on function public.provision_customer_account(uuid,text,text,text) to service_role;
grant execute on function public.update_customer_profile(text,jsonb) to service_role;
grant execute on function public.clear_customer_library(text) to service_role;

notify pgrst, 'reload schema';
commit;
