-- Lets custom roles hold the Academy permissions. Function bodies match 0018
-- except for the permission vocabulary.
--
-- Deliberately seeds no role_permissions rows. The API that predates this
-- release throws on permission values it does not know, so an admin row here
-- would lock every administrator out if this ran first. The protected admin
-- role is complete in code, and editors keep their current access. Roles only
-- gain Academy access when an administrator grants it.

begin;

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
        'courses.view',
        'courses.manage',
        'subscribers.view',
        'subscribers.manage',
        'forms.view',
        'forms.manage',
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
          'courses.view',
          'courses.manage',
          'subscribers.view',
          'subscribers.manage',
          'forms.view',
          'forms.manage',
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

  if not found or v_actor.status <> 'active' or not (
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
    'courses.view',
    'courses.manage',
    'subscribers.view',
    'subscribers.manage',
    'forms.view',
    'forms.manage',
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

  if not found or v_actor.status <> 'active' or not (
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
    'courses.view',
    'courses.manage',
    'subscribers.view',
    'subscribers.manage',
    'forms.view',
    'forms.manage',
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
      'courses.view',
      'courses.manage',
      'subscribers.view',
      'subscribers.manage',
      'forms.view',
      'forms.manage',
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

insert into public.schema_migrations (filename)
values ('0027_academy_role_functions.sql')
on conflict do nothing;

commit;
