-- Studio administrators are a separate identity domain from application users.
-- Application users remain in public.users for listening, subscriptions,
-- follows, and playback. Studio roles and permissions attach only to
-- public.studio_members.

begin;

lock table public.users in share row exclusive mode;
lock table public.subscriptions in share row exclusive mode;
lock table public.follows in share row exclusive mode;
lock table public.playback_progress in share row exclusive mode;
lock table public.studio_roles in share row exclusive mode;
lock table public.role_permissions in share row exclusive mode;
lock table public.user_access_audit_logs in share row exclusive mode;
lock table public.user_invitation_audit_logs in share row exclusive mode;
lock table public.role_permission_audit_logs in share row exclusive mode;
lock table public.role_creation_audit_logs in share row exclusive mode;

-- A legacy staff row must not own app-only data. Stop instead of silently
-- moving or deleting that data so an operator can classify it explicitly.
do $$
begin
  if exists (
    select 1
    from public.users as legacy_staff
    where legacy_staff.role <> 'listener'
      and (
        exists (
          select 1 from public.subscriptions
          where subscriptions.user_id = legacy_staff.id
        )
        or exists (
          select 1 from public.follows
          where follows.user_id = legacy_staff.id
        )
        or exists (
          select 1 from public.playback_progress
          where playback_progress.user_id = legacy_staff.id
        )
      )
  ) then
    raise exception using
      message = 'legacy Studio staff rows own app-user data',
      hint = 'Classify the affected subscriptions, follows, or playback rows before applying migration 0009.';
  end if;

  if exists (
    select actor_user_id from public.user_access_audit_logs
    union all
    select target_user_id from public.user_access_audit_logs
    union all
    select actor_user_id from public.user_invitation_audit_logs
    union all
    select target_user_id from public.user_invitation_audit_logs
    union all
    select actor_user_id from public.role_permission_audit_logs
    union all
    select actor_user_id from public.role_creation_audit_logs
    except
    select id from public.users where role <> 'listener'
  ) then
    raise exception using
      message = 'legacy Studio audit history references an app-only user',
      hint = 'Classify the referenced identity before applying migration 0009; audit history will not be rewritten implicitly.';
  end if;
end;
$$;

create table public.studio_members (
  id text primary key,
  auth_user_id uuid references auth.users (id) on delete set null,
  email text not null,
  display_name text not null,
  role_id text not null references public.studio_roles (id)
    on update cascade on delete restrict,
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  created_at timestamptz not null default now(),
  constraint studio_members_email_canonical check (
    email = lower(btrim(email)) and char_length(email) between 3 and 254
  )
);

create unique index studio_members_auth_user_id_unique
  on public.studio_members (auth_user_id)
  where auth_user_id is not null;

create unique index studio_members_email_lower_unique
  on public.studio_members (lower(email));

comment on table public.studio_members is
  'Private Studio administrators. Membership is independent from public.users app profiles.';
comment on column public.studio_members.auth_user_id is
  'Verified immutable Supabase Auth identity. Runtime email matching is forbidden.';

insert into public.studio_members (
  id,
  auth_user_id,
  email,
  display_name,
  role_id,
  locale,
  created_at
)
select
  id,
  auth_user_id,
  email,
  display_name,
  role,
  locale,
  created_at
from public.users
where role <> 'listener';

-- Drop functions that depend on the legacy mixed users.role column before the
-- column and old function parameter names are removed.
drop function if exists public.create_studio_role(text, text, text, text[], uuid);
drop function if exists public.change_role_permissions(text, text, text[], uuid);
drop function if exists public.change_user_role(text, text, text, uuid);
drop function if exists public.provision_invited_user(text, uuid, text, text, text, text, uuid);
drop function if exists public.studio_role_json(text);

-- Audit entities keep their append-only history, but their actor and target
-- references now point only to Studio members.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select conrelid::regclass as table_name, conname
    from pg_catalog.pg_constraint
    where contype = 'f'
      and confrelid = 'public.users'::regclass
      and conrelid in (
        'public.user_access_audit_logs'::regclass,
        'public.user_invitation_audit_logs'::regclass,
        'public.role_permission_audit_logs'::regclass,
        'public.role_creation_audit_logs'::regclass
      )
  loop
    execute format('alter table %s drop constraint %I', v_constraint.table_name, v_constraint.conname);
  end loop;

  -- Role values in an immutable audit record are snapshots. Removing the old
  -- listener pseudo-role must not delete or rewrite historical audit entries.
  for v_constraint in
    select conrelid::regclass as table_name, conname
    from pg_catalog.pg_constraint
    where contype = 'f'
      and confrelid = 'public.studio_roles'::regclass
      and conrelid in (
        'public.user_access_audit_logs'::regclass,
        'public.user_invitation_audit_logs'::regclass,
        'public.role_permission_audit_logs'::regclass
      )
  loop
    execute format('alter table %s drop constraint %I', v_constraint.table_name, v_constraint.conname);
  end loop;
end;
$$;

alter table public.user_access_audit_logs
  rename to studio_member_access_audit_logs;
alter table public.studio_member_access_audit_logs
  rename column actor_user_id to actor_studio_member_id;
alter table public.studio_member_access_audit_logs
  rename column target_user_id to target_studio_member_id;

alter table public.user_invitation_audit_logs
  rename to studio_member_invitation_audit_logs;
alter table public.studio_member_invitation_audit_logs
  rename column actor_user_id to actor_studio_member_id;
alter table public.studio_member_invitation_audit_logs
  rename column target_user_id to target_studio_member_id;

alter table public.role_permission_audit_logs
  rename column actor_user_id to actor_studio_member_id;
alter table public.role_creation_audit_logs
  rename column actor_user_id to actor_studio_member_id;

alter index public.user_access_audit_logs_created_at_idx
  rename to studio_member_access_audit_logs_created_at_idx;
alter index public.user_access_audit_logs_target_idx
  rename to studio_member_access_audit_logs_target_idx;
alter index public.user_invitation_audit_logs_created_at_idx
  rename to studio_member_invitation_audit_logs_created_at_idx;
alter index public.user_invitation_audit_logs_target_idx
  rename to studio_member_invitation_audit_logs_target_idx;

alter table public.studio_member_access_audit_logs
  add constraint studio_member_access_audit_logs_actor_fkey
    foreign key (actor_studio_member_id) references public.studio_members (id) on delete restrict,
  add constraint studio_member_access_audit_logs_target_fkey
    foreign key (target_studio_member_id) references public.studio_members (id) on delete restrict;

alter table public.studio_member_invitation_audit_logs
  add constraint studio_member_invitation_audit_logs_actor_fkey
    foreign key (actor_studio_member_id) references public.studio_members (id) on delete restrict,
  add constraint studio_member_invitation_audit_logs_target_fkey
    foreign key (target_studio_member_id) references public.studio_members (id) on delete restrict;

alter table public.role_permission_audit_logs
  add constraint role_permission_audit_logs_actor_studio_member_fkey
    foreign key (actor_studio_member_id) references public.studio_members (id) on delete restrict;

alter table public.role_creation_audit_logs
  add constraint role_creation_audit_logs_actor_studio_member_fkey
    foreign key (actor_studio_member_id) references public.studio_members (id) on delete restrict;

-- Remove Studio semantics from the application-user table. The rows remaining
-- here are app users regardless of subscription status.
delete from public.users where role <> 'listener';

alter table public.users drop constraint users_role_fkey;
alter table public.users drop column role;

delete from public.role_permissions where role = 'listener';
delete from public.studio_roles where id = 'listener';

alter table public.studio_members enable row level security;

create or replace function public.studio_role_json(p_role_id text)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select jsonb_build_object(
    'id', role_row.id,
    'name', role_row.name,
    'description', role_row.description,
    'isSystem', role_row.is_system,
    'isProtected', role_row.is_protected,
    'permissions', coalesce((
      select jsonb_agg(
        stored.permission::text
        order by array_position(array[
          'overview.view',
          'episodes.view',
          'episodes.manage',
          'shows.view',
          'shows.manage',
          'guests.view',
          'guests.manage',
          'articles.view',
          'articles.manage',
          'subscribers.view',
          'subscribers.manage',
          'access.view',
          'access.manage'
        ]::text[], stored.permission::text)
      )
      from public.role_permissions as stored
      where stored.role = role_row.id
    ), '[]'::jsonb),
    'memberCount', (
      select count(*)
      from public.studio_members as assigned
      where assigned.role_id = role_row.id
    ),
    'createdAt', role_row.created_at,
    'updatedAt', role_row.updated_at
  )
  from public.studio_roles as role_row
  where role_row.id = p_role_id;
$$;

create or replace function public.create_studio_role(
  p_actor_studio_member_id text,
  p_name text,
  p_description text,
  p_permissions text[],
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.studio_members%rowtype;
  v_role_id text := 'role-' || replace(gen_random_uuid()::text, '-', '');
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g');
  v_description text := btrim(coalesce(p_description, ''));
  v_normalized text[];
begin
  perform pg_advisory_xact_lock(hashtextextended('mukhtalif:studio-access-control', 0));

  select * into v_actor
  from public.studio_members
  where id = p_actor_studio_member_id
  for update;

  if not found or not (
    v_actor.role_id = 'admin'
    or exists (
      select 1 from public.role_permissions
      where role = v_actor.role_id
        and permission = 'access.manage'::public.studio_permission
    )
  ) then
    return jsonb_build_object('status', 'forbidden');
  end if;

  if char_length(v_name) not between 2 and 60
     or char_length(v_description) > 240
     or p_request_id is null then
    return jsonb_build_object('status', 'invalid_input');
  end if;
  if public.valid_studio_permissions(p_permissions) is not true then
    return jsonb_build_object('status', 'invalid_permissions');
  end if;
  if exists (select 1 from public.studio_roles where lower(name) = lower(v_name)) then
    return jsonb_build_object('status', 'duplicate_name');
  end if;

  select coalesce(array_agg(candidate.permission order by candidate.ordinality), array[]::text[])
  into v_normalized
  from unnest(array[
    'overview.view',
    'episodes.view',
    'episodes.manage',
    'shows.view',
    'shows.manage',
    'guests.view',
    'guests.manage',
    'articles.view',
    'articles.manage',
    'subscribers.view',
    'subscribers.manage',
    'access.view',
    'access.manage'
  ]::text[]) with ordinality as candidate(permission, ordinality)
  where candidate.permission = any(p_permissions);

  insert into public.studio_roles (id, name, description)
  values (v_role_id, v_name, v_description);

  insert into public.role_permissions (role, permission)
  select v_role_id, permission::public.studio_permission
  from unnest(v_normalized) as normalized(permission);

  insert into public.role_creation_audit_logs (
    actor_studio_member_id,
    target_role,
    role_name,
    initial_permissions,
    request_id
  ) values (
    v_actor.id,
    v_role_id,
    v_name,
    v_normalized,
    p_request_id
  );

  return jsonb_build_object(
    'status', 'created',
    'role', public.studio_role_json(v_role_id)
  );
end;
$$;

create or replace function public.change_role_permissions(
  p_actor_studio_member_id text,
  p_target_role text,
  p_permissions text[],
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.studio_members%rowtype;
  v_role public.studio_roles%rowtype;
  v_previous text[];
  v_normalized text[];
begin
  perform pg_advisory_xact_lock(hashtextextended('mukhtalif:studio-access-control', 0));

  select * into v_actor
  from public.studio_members
  where id = p_actor_studio_member_id
  for update;

  if not found or not (
    v_actor.role_id = 'admin'
    or exists (
      select 1 from public.role_permissions
      where role = v_actor.role_id
        and permission = 'access.manage'::public.studio_permission
    )
  ) then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select * into v_role
  from public.studio_roles
  where id = p_target_role
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_role.is_protected then
    return jsonb_build_object('status', 'immutable_role');
  end if;
  if p_request_id is null
     or public.valid_studio_permissions(p_permissions) is not true then
    return jsonb_build_object('status', 'invalid_permissions');
  end if;

  select coalesce(array_agg(candidate.permission order by candidate.ordinality), array[]::text[])
  into v_normalized
  from unnest(array[
    'overview.view',
    'episodes.view',
    'episodes.manage',
    'shows.view',
    'shows.manage',
    'guests.view',
    'guests.manage',
    'articles.view',
    'articles.manage',
    'subscribers.view',
    'subscribers.manage',
    'access.view',
    'access.manage'
  ]::text[]) with ordinality as candidate(permission, ordinality)
  where candidate.permission = any(p_permissions);

  select coalesce(array_agg(
    stored.permission::text
    order by array_position(array[
      'overview.view',
      'episodes.view',
      'episodes.manage',
      'shows.view',
      'shows.manage',
      'guests.view',
      'guests.manage',
      'articles.view',
      'articles.manage',
      'subscribers.view',
      'subscribers.manage',
      'access.view',
      'access.manage'
    ]::text[], stored.permission::text)
  ), array[]::text[])
  into v_previous
  from public.role_permissions as stored
  where stored.role = v_role.id;

  if v_previous = v_normalized then
    return jsonb_build_object(
      'status', 'unchanged',
      'role', public.studio_role_json(v_role.id)
    );
  end if;

  delete from public.role_permissions where role = v_role.id;
  insert into public.role_permissions (role, permission)
  select v_role.id, permission::public.studio_permission
  from unnest(v_normalized) as normalized(permission);

  update public.studio_roles set updated_at = now() where id = v_role.id;

  insert into public.role_permission_audit_logs (
    actor_studio_member_id,
    target_role,
    previous_permissions,
    new_permissions,
    request_id
  ) values (
    v_actor.id,
    v_role.id,
    v_previous,
    v_normalized,
    p_request_id
  );

  return jsonb_build_object(
    'status', 'updated',
    'role', public.studio_role_json(v_role.id)
  );
end;
$$;

create or replace function public.change_studio_member_role(
  p_actor_studio_member_id text,
  p_target_studio_member_id text,
  p_new_role text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.studio_members%rowtype;
  v_target public.studio_members%rowtype;
  v_selected_role public.studio_roles%rowtype;
  v_admin_count integer;
  v_previous_role text;
begin
  perform pg_advisory_xact_lock(hashtextextended('mukhtalif:studio-access-control', 0));

  select * into v_actor
  from public.studio_members
  where id = p_actor_studio_member_id
  for update;

  if not found or not (
    v_actor.role_id = 'admin'
    or exists (
      select 1 from public.role_permissions
      where role = v_actor.role_id
        and permission = 'access.manage'::public.studio_permission
    )
  ) then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select * into v_target
  from public.studio_members
  where id = p_target_studio_member_id
  for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  select * into v_selected_role
  from public.studio_roles
  where id = p_new_role
  for share;
  if not found then
    return jsonb_build_object('status', 'role_not_found');
  end if;

  if v_actor.id = v_target.id then
    return jsonb_build_object('status', 'self_demotion');
  end if;
  if (v_target.role_id = 'admin' or v_selected_role.is_protected)
     and v_actor.role_id <> 'admin' then
    return jsonb_build_object('status', 'protected_role');
  end if;
  if v_target.role_id = p_new_role then
    return jsonb_build_object(
      'status', 'unchanged',
      'member', to_jsonb(v_target) || jsonb_build_object('role_name', v_selected_role.name)
    );
  end if;
  if v_target.role_id = 'admin' and p_new_role <> 'admin' then
    select count(*) into v_admin_count
    from public.studio_members
    where role_id = 'admin';
    if v_admin_count <= 1 then
      return jsonb_build_object('status', 'last_admin');
    end if;
  end if;

  v_previous_role := v_target.role_id;
  update public.studio_members
  set role_id = p_new_role
  where id = v_target.id
  returning * into v_target;

  insert into public.studio_member_access_audit_logs (
    actor_studio_member_id,
    target_studio_member_id,
    previous_role,
    new_role,
    request_id
  ) values (
    v_actor.id,
    v_target.id,
    v_previous_role,
    p_new_role,
    p_request_id
  );

  return jsonb_build_object(
    'status', 'updated',
    'member', to_jsonb(v_target) || jsonb_build_object('role_name', v_selected_role.name)
  );
end;
$$;

create or replace function public.provision_invited_studio_member(
  p_actor_studio_member_id text,
  p_auth_user_id uuid,
  p_display_name text,
  p_email text,
  p_role text,
  p_locale text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.studio_members%rowtype;
  v_selected_role public.studio_roles%rowtype;
  v_target public.studio_members%rowtype;
  v_email text := lower(btrim(p_email));
  v_display_name text := btrim(p_display_name);
  v_target_id text := 'stm-' || replace(gen_random_uuid()::text, '-', '');
begin
  perform pg_advisory_xact_lock(hashtextextended('mukhtalif:studio-access-control', 0));

  select * into v_actor
  from public.studio_members
  where id = p_actor_studio_member_id
  for update;
  if not found or not (
    v_actor.role_id = 'admin'
    or exists (
      select 1 from public.role_permissions
      where role = v_actor.role_id
        and permission = 'access.manage'::public.studio_permission
    )
  ) then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select * into v_selected_role
  from public.studio_roles
  where id = p_role
  for share;
  if not found then
    return jsonb_build_object('status', 'role_not_found');
  end if;
  if v_selected_role.is_protected and v_actor.role_id <> 'admin' then
    return jsonb_build_object('status', 'protected_role');
  end if;

  if p_auth_user_id is null
     or p_request_id is null
     or p_display_name is null
     or p_email is null
     or p_locale is null
     or p_locale not in ('ar', 'en')
     or char_length(v_display_name) not between 2 and 100
     or char_length(v_email) not between 3 and 254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return jsonb_build_object('status', 'invalid_input');
  end if;
  if exists (select 1 from public.studio_members where lower(email) = v_email) then
    return jsonb_build_object('status', 'duplicate_email');
  end if;
  if exists (select 1 from public.studio_members where auth_user_id = p_auth_user_id) then
    return jsonb_build_object('status', 'duplicate_auth_identity');
  end if;

  insert into public.studio_members (
    id,
    auth_user_id,
    display_name,
    email,
    role_id,
    locale
  ) values (
    v_target_id,
    p_auth_user_id,
    v_display_name,
    v_email,
    p_role,
    p_locale
  ) returning * into v_target;

  insert into public.studio_member_invitation_audit_logs (
    actor_studio_member_id,
    target_studio_member_id,
    invited_email,
    assigned_role,
    locale,
    request_id
  ) values (
    v_actor.id,
    v_target.id,
    v_target.email,
    v_target.role_id,
    v_target.locale,
    p_request_id
  );

  return jsonb_build_object(
    'status', 'created',
    'member', to_jsonb(v_target) || jsonb_build_object('role_name', v_selected_role.name)
  );
end;
$$;

revoke all on table public.studio_members from anon, authenticated, service_role;
grant select on table public.studio_members to service_role;

revoke all on function public.studio_role_json(text) from public, anon, authenticated;
revoke all on function public.create_studio_role(text, text, text, text[], uuid)
  from public, anon, authenticated;
revoke all on function public.change_role_permissions(text, text, text[], uuid)
  from public, anon, authenticated;
revoke all on function public.change_studio_member_role(text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.provision_invited_studio_member(
  text,
  uuid,
  text,
  text,
  text,
  text,
  uuid
) from public, anon, authenticated;

grant execute on function public.create_studio_role(text, text, text, text[], uuid)
  to service_role;
grant execute on function public.change_role_permissions(text, text, text[], uuid)
  to service_role;
grant execute on function public.change_studio_member_role(text, text, text, uuid)
  to service_role;
grant execute on function public.provision_invited_studio_member(
  text,
  uuid,
  text,
  text,
  text,
  text,
  uuid
) to service_role;

commit;
