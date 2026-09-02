-- Granular Studio permissions are assigned to roles, not individual users.
-- Administrators are system owners and always resolve to every permission in
-- application code. Only listener and editor matrices are persisted here.

create type public.studio_permission as enum (
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
);

create table public.role_permissions (
  role public.user_role not null,
  permission public.studio_permission not null,
  created_at timestamptz not null default now(),
  primary key (role, permission),
  check (role <> 'admin'::public.user_role),
  check (permission not in (
    'access.view'::public.studio_permission,
    'access.manage'::public.studio_permission
  ))
);

insert into public.role_permissions (role, permission) values
  ('editor', 'overview.view'),
  ('editor', 'episodes.view'),
  ('editor', 'episodes.manage'),
  ('editor', 'shows.view'),
  ('editor', 'shows.manage'),
  ('editor', 'guests.view'),
  ('editor', 'guests.manage'),
  ('editor', 'articles.view'),
  ('editor', 'articles.manage');

create table public.role_permission_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id text not null references public.users (id) on delete restrict,
  target_role public.user_role not null,
  previous_permissions text[] not null,
  new_permissions text[] not null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  check (target_role <> 'admin'::public.user_role),
  check (previous_permissions <> new_permissions)
);

create index role_permission_audit_logs_created_at_idx
  on public.role_permission_audit_logs (created_at desc);

alter table public.role_permissions enable row level security;
alter table public.role_permission_audit_logs enable row level security;

create trigger role_permission_audit_logs_append_only
before update or delete on public.role_permission_audit_logs
for each row execute function public.prevent_user_access_audit_mutation();

create or replace function public.change_role_permissions(
  p_actor_user_id text,
  p_target_role public.user_role,
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
  v_canonical constant text[] := array[
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
  ];
  v_requested text[] := coalesce(p_permissions, array[]::text[]);
  v_previous text[];
  v_normalized text[];
begin
  -- Serialize matrix changes and re-check the actor after acquiring the lock.
  perform pg_advisory_xact_lock(hashtextextended('mukhtalif:role-permissions', 0));

  select * into v_actor
  from public.users
  where id = p_actor_user_id
  for update;

  if not found or v_actor.role <> 'admin'::public.user_role then
    return jsonb_build_object('status', 'forbidden');
  end if;

  if p_target_role = 'admin'::public.user_role then
    return jsonb_build_object('status', 'immutable_role');
  end if;

  if array_position(v_requested, null) is not null
     or cardinality(v_requested) <> (
       select count(distinct requested.permission)
       from unnest(v_requested) as requested(permission)
     )
     or exists (
       select 1 from unnest(v_requested) as requested(permission)
       where requested.permission <> all(v_canonical)
     )
     or exists (
       select 1 from unnest(v_requested) as requested(permission)
       where requested.permission like '%.manage'
         and replace(requested.permission, '.manage', '.view') <> all(v_requested)
     )
     or 'access.view' = any(v_requested)
     or 'access.manage' = any(v_requested) then
    return jsonb_build_object('status', 'invalid_permissions');
  end if;

  -- The request was validated above; this step applies canonical ordering.
  select coalesce(array_agg(candidate.permission order by candidate.ordinality), array[]::text[])
  into v_normalized
  from unnest(v_canonical) with ordinality as candidate(permission, ordinality)
  where candidate.permission = any(v_requested);

  select coalesce(
    array_agg(
      stored.permission::text
      order by array_position(v_canonical, stored.permission::text)
    ),
    array[]::text[]
  )
  into v_previous
  from public.role_permissions as stored
  where stored.role = p_target_role;

  if v_previous = v_normalized then
    return jsonb_build_object(
      'status', 'unchanged',
      'role', p_target_role,
      'permissions', to_jsonb(v_previous)
    );
  end if;

  delete from public.role_permissions where role = p_target_role;

  insert into public.role_permissions (role, permission)
  select p_target_role, permission::public.studio_permission
  from unnest(v_normalized) as normalized(permission);

  insert into public.role_permission_audit_logs (
    actor_user_id,
    target_role,
    previous_permissions,
    new_permissions,
    request_id
  ) values (
    v_actor.id,
    p_target_role,
    v_previous,
    v_normalized,
    p_request_id
  );

  return jsonb_build_object(
    'status', 'updated',
    'role', p_target_role,
    'permissions', to_jsonb(v_normalized)
  );
end;
$$;

revoke all on table public.role_permissions from anon, authenticated, service_role;
revoke all on table public.role_permission_audit_logs from anon, authenticated, service_role;
grant select on table public.role_permissions to service_role;
grant select on table public.role_permission_audit_logs to service_role;

revoke all on function public.change_role_permissions(text, public.user_role, text[], uuid)
  from public, anon, authenticated;
grant execute on function public.change_role_permissions(text, public.user_role, text[], uuid)
  to service_role;
