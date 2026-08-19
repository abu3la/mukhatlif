-- Dynamic Studio roles replace the closed user_role enum at every active
-- authorization boundary. The enum remains in place, unused, so rollback and
-- historical schema inspection do not require a destructive type drop.

begin;

create table public.studio_roles (
  id text primary key,
  name text not null,
  description text not null default '',
  is_system boolean not null default false,
  is_protected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio_roles_id_format check (
    char_length(id) between 1 and 64
    and id ~ '^[A-Za-z0-9][A-Za-z0-9_-]*$'
  ),
  constraint studio_roles_name_format check (
    char_length(name) between 2 and 60
    and name = regexp_replace(btrim(name), '[[:space:]]+', ' ', 'g')
  ),
  constraint studio_roles_description_length check (char_length(description) <= 240),
  constraint studio_roles_protected_system check (not is_protected or is_system),
  constraint studio_roles_only_admin_protected check (not is_protected or id = 'admin')
);

create unique index studio_roles_name_normalized_unique
  on public.studio_roles (lower(name));

insert into public.studio_roles (
  id,
  name,
  description,
  is_system,
  is_protected,
  created_at,
  updated_at
) values
  (
    'admin',
    'المشرف العام',
    'صلاحيات النظام الكاملة والمحمية.',
    true,
    true,
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z'
  ),
  (
    'editor',
    'مدير المحتوى',
    'إدارة المحتوى والبرامج والحلقات.',
    true,
    false,
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z'
  ),
  (
    'listener',
    'المستمع',
    'حساب مستمع بلا وصول إلى الاستوديو.',
    true,
    false,
    '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z'
  );

-- Enum-typed function signatures must be removed before their dependent
-- columns can be converted to role IDs stored as text.
drop function if exists public.change_user_role(
  text,
  text,
  public.user_role,
  uuid
);
drop function if exists public.change_role_permissions(
  text,
  public.user_role,
  text[],
  uuid
);
drop function if exists public.provision_invited_user(
  text,
  uuid,
  text,
  text,
  public.user_role,
  text,
  uuid
);

-- Remove enum-specific checks before changing their column types. Equivalent
-- dynamic checks and foreign keys are installed below.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select conname, conrelid::regclass as table_name
    from pg_catalog.pg_constraint
    where conrelid in (
      'public.role_permissions'::regclass,
      'public.role_permission_audit_logs'::regclass,
      'public.user_access_audit_logs'::regclass
    )
      and contype = 'c'
  loop
    execute format(
      'alter table %s drop constraint %I',
      v_constraint.table_name,
      v_constraint.conname
    );
  end loop;
end;
$$;

alter table public.users alter column role drop default;
alter table public.users alter column role type text using role::text;
alter table public.users alter column role set default 'listener';

alter table public.role_permissions
  alter column role type text using role::text;
alter table public.user_access_audit_logs
  alter column previous_role type text using previous_role::text,
  alter column new_role type text using new_role::text;
alter table public.user_invitation_audit_logs
  alter column assigned_role type text using assigned_role::text;
alter table public.role_permission_audit_logs
  alter column target_role type text using target_role::text;

alter table public.users
  add constraint users_role_fkey
  foreign key (role) references public.studio_roles (id)
  on update cascade on delete restrict;
alter table public.role_permissions
  add constraint role_permissions_role_fkey
  foreign key (role) references public.studio_roles (id)
  on update cascade on delete restrict;
alter table public.user_access_audit_logs
  add constraint user_access_audit_logs_previous_role_fkey
    foreign key (previous_role) references public.studio_roles (id)
    on update cascade on delete restrict,
  add constraint user_access_audit_logs_new_role_fkey
    foreign key (new_role) references public.studio_roles (id)
    on update cascade on delete restrict,
  add constraint user_access_audit_logs_role_changed
    check (previous_role <> new_role);
alter table public.user_invitation_audit_logs
  add constraint user_invitation_audit_logs_assigned_role_fkey
  foreign key (assigned_role) references public.studio_roles (id)
  on update cascade on delete restrict;
alter table public.role_permission_audit_logs
  add constraint role_permission_audit_logs_target_role_fkey
    foreign key (target_role) references public.studio_roles (id)
    on update cascade on delete restrict,
  add constraint role_permission_audit_logs_permissions_changed
    check (previous_permissions <> new_permissions);

-- Administrator permissions are persisted as immutable seed data so every
-- resolution path, including SQL authorization, sees the same full matrix.
insert into public.role_permissions (role, permission)
select 'admin', permission::public.studio_permission
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
]) as seeded(permission)
on conflict do nothing;

create table public.role_creation_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id text not null references public.users (id) on delete restrict,
  target_role text not null references public.studio_roles (id) on delete restrict,
  role_name text not null,
  initial_permissions text[] not null,
  request_id uuid not null unique,
  created_at timestamptz not null default now()
);

create index role_creation_audit_logs_created_at_idx
  on public.role_creation_audit_logs (created_at desc);

alter table public.studio_roles enable row level security;
alter table public.role_creation_audit_logs enable row level security;

create trigger role_creation_audit_logs_append_only
before update or delete on public.role_creation_audit_logs
for each row execute function public.prevent_user_access_audit_mutation();

create or replace function public.valid_studio_permissions(p_permissions text[])
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog, public
as $$
  select
    p_permissions is not null
    and array_position(p_permissions, null) is null
    and cardinality(p_permissions) = (
      select count(distinct requested.permission)
      from unnest(p_permissions) as requested(permission)
    )
    and not exists (
      select 1
      from unnest(p_permissions) as requested(permission)
      where requested.permission <> all(array[
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
      ]::text[])
    )
    and not exists (
      select 1
      from unnest(p_permissions) as requested(permission)
      where requested.permission like '%.manage'
        and replace(requested.permission, '.manage', '.view') <> all(p_permissions)
    );
$$;

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
    'userCount', (
      select count(*) from public.users as assigned where assigned.role = role_row.id
    ),
    'createdAt', role_row.created_at,
    'updatedAt', role_row.updated_at
  )
  from public.studio_roles as role_row
  where role_row.id = p_role_id;
$$;

create or replace function public.create_studio_role(
  p_actor_user_id text,
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
  v_actor public.users%rowtype;
  v_role_id text := 'role-' || replace(gen_random_uuid()::text, '-', '');
  v_name text := regexp_replace(btrim(coalesce(p_name, '')), '[[:space:]]+', ' ', 'g');
  v_description text := btrim(coalesce(p_description, ''));
  v_normalized text[];
begin
  perform pg_advisory_xact_lock(hashtextextended('mukhtalif:access-control', 0));

  select * into v_actor
  from public.users
  where id = p_actor_user_id
  for update;

  if not found or not (
    v_actor.role = 'admin'
    or exists (
      select 1 from public.role_permissions
      where role = v_actor.role
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

  if exists (
    select 1 from public.studio_roles where lower(name) = lower(v_name)
  ) then
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
    actor_user_id,
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
  p_actor_user_id text,
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
  v_actor public.users%rowtype;
  v_role public.studio_roles%rowtype;
  v_previous text[];
  v_normalized text[];
begin
  perform pg_advisory_xact_lock(hashtextextended('mukhtalif:access-control', 0));

  select * into v_actor
  from public.users
  where id = p_actor_user_id
  for update;

  if not found or not (
    v_actor.role = 'admin'
    or exists (
      select 1 from public.role_permissions
      where role = v_actor.role
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

  update public.studio_roles
  set updated_at = now()
  where id = v_role.id;

  insert into public.role_permission_audit_logs (
    actor_user_id,
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

create or replace function public.change_user_role(
  p_actor_user_id text,
  p_target_user_id text,
  p_new_role text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor public.users%rowtype;
  v_target public.users%rowtype;
  v_selected_role public.studio_roles%rowtype;
  v_admin_count integer;
  v_previous_role text;
begin
  perform pg_advisory_xact_lock(hashtextextended('mukhtalif:access-control', 0));

  select * into v_actor
  from public.users
  where id = p_actor_user_id
  for update;

  if not found or not (
    v_actor.role = 'admin'
    or exists (
      select 1 from public.role_permissions
      where role = v_actor.role
        and permission = 'access.manage'::public.studio_permission
    )
  ) then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select * into v_target
  from public.users
  where id = p_target_user_id
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
  if (v_target.role = 'admin' or v_selected_role.is_protected)
     and v_actor.role <> 'admin' then
    return jsonb_build_object('status', 'protected_role');
  end if;
  if v_target.role = p_new_role then
    return jsonb_build_object(
      'status', 'unchanged',
      'user', to_jsonb(v_target) || jsonb_build_object('role_name', v_selected_role.name)
    );
  end if;
  if p_new_role <> 'listener' and v_target.auth_user_id is null then
    return jsonb_build_object('status', 'auth_unlinked');
  end if;
  if v_target.role = 'admin' and p_new_role <> 'admin' then
    select count(*) into v_admin_count from public.users where role = 'admin';
    if v_admin_count <= 1 then
      return jsonb_build_object('status', 'last_admin');
    end if;
  end if;

  v_previous_role := v_target.role;
  update public.users set role = p_new_role where id = v_target.id returning * into v_target;

  insert into public.user_access_audit_logs (
    actor_user_id,
    target_user_id,
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
    'user', to_jsonb(v_target) || jsonb_build_object('role_name', v_selected_role.name)
  );
end;
$$;

create or replace function public.provision_invited_user(
  p_actor_user_id text,
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
  v_actor public.users%rowtype;
  v_selected_role public.studio_roles%rowtype;
  v_target public.users%rowtype;
  v_email text := lower(btrim(p_email));
  v_display_name text := btrim(p_display_name);
  v_target_id text := 'usr-' || replace(gen_random_uuid()::text, '-', '');
begin
  perform pg_advisory_xact_lock(hashtextextended('mukhtalif:access-control', 0));

  select * into v_actor
  from public.users
  where id = p_actor_user_id
  for update;
  if not found or not (
    v_actor.role = 'admin'
    or exists (
      select 1 from public.role_permissions
      where role = v_actor.role
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
  if v_selected_role.is_protected and v_actor.role <> 'admin' then
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
  if exists (select 1 from public.users where lower(email) = v_email) then
    return jsonb_build_object('status', 'duplicate_email');
  end if;
  if exists (select 1 from public.users where auth_user_id = p_auth_user_id) then
    return jsonb_build_object('status', 'duplicate_auth_identity');
  end if;

  insert into public.users (id, auth_user_id, display_name, email, role, locale)
  values (v_target_id, p_auth_user_id, v_display_name, v_email, p_role, p_locale)
  returning * into v_target;

  insert into public.user_invitation_audit_logs (
    actor_user_id,
    target_user_id,
    invited_email,
    assigned_role,
    locale,
    request_id
  ) values (
    v_actor.id,
    v_target.id,
    v_target.email,
    v_target.role,
    v_target.locale,
    p_request_id
  );

  return jsonb_build_object(
    'status', 'created',
    'user', to_jsonb(v_target) || jsonb_build_object('role_name', v_selected_role.name)
  );
end;
$$;

revoke all on table public.studio_roles from anon, authenticated, service_role;
revoke all on table public.role_creation_audit_logs from anon, authenticated, service_role;
grant select on table public.studio_roles to service_role;
grant select on table public.role_creation_audit_logs to service_role;

revoke all on function public.valid_studio_permissions(text[]) from public, anon, authenticated;
revoke all on function public.studio_role_json(text) from public, anon, authenticated;
revoke all on function public.create_studio_role(text, text, text, text[], uuid)
  from public, anon, authenticated;
revoke all on function public.change_role_permissions(text, text, text[], uuid)
  from public, anon, authenticated;
revoke all on function public.change_user_role(text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.provision_invited_user(
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
grant execute on function public.change_user_role(text, text, text, uuid)
  to service_role;
grant execute on function public.provision_invited_user(
  text,
  uuid,
  text,
  text,
  text,
  text,
  uuid
) to service_role;

commit;
