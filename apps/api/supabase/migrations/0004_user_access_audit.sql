-- Role changes and their audit record are one transaction. The function also
-- re-checks the actor after serializing role changes, so concurrent requests
-- cannot demote every administrator.

create table public.user_access_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id text not null references public.users (id) on delete restrict,
  target_user_id text not null references public.users (id) on delete restrict,
  previous_role public.user_role not null,
  new_role public.user_role not null,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  check (previous_role <> new_role)
);

create index user_access_audit_logs_created_at_idx
  on public.user_access_audit_logs (created_at desc);

create index user_access_audit_logs_target_idx
  on public.user_access_audit_logs (target_user_id, created_at desc);

alter table public.user_access_audit_logs enable row level security;

create or replace function public.prevent_user_access_audit_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  raise exception 'user access audit logs are append-only';
end;
$$;

create trigger user_access_audit_logs_append_only
before update or delete on public.user_access_audit_logs
for each row execute function public.prevent_user_access_audit_mutation();

create or replace function public.change_user_role(
  p_actor_user_id text,
  p_target_user_id text,
  p_new_role public.user_role,
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
  v_admin_count integer;
  v_previous_role public.user_role;
begin
  -- Serialize every role change. The actor is loaded only after this lock so a
  -- concurrently demoted admin cannot authorize a second change.
  perform pg_advisory_xact_lock(hashtextextended('mukhtalif:user-role', 0));

  select * into v_actor
  from public.users
  where id = p_actor_user_id
  for update;

  if not found or v_actor.role <> 'admin'::public.user_role then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select * into v_target
  from public.users
  where id = p_target_user_id
  for update;

  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if v_actor.id = v_target.id then
    return jsonb_build_object('status', 'self_demotion');
  end if;

  if v_target.role = p_new_role then
    return jsonb_build_object('status', 'unchanged', 'user', to_jsonb(v_target));
  end if;

  if p_new_role in ('editor'::public.user_role, 'admin'::public.user_role)
     and v_target.auth_user_id is null then
    return jsonb_build_object('status', 'auth_unlinked');
  end if;

  if v_target.role = 'admin'::public.user_role
     and p_new_role <> 'admin'::public.user_role then
    select count(*) into v_admin_count
    from public.users
    where role = 'admin'::public.user_role;

    if v_admin_count <= 1 then
      return jsonb_build_object('status', 'last_admin');
    end if;
  end if;

  v_previous_role := v_target.role;

  update public.users
  set role = p_new_role
  where id = v_target.id
  returning * into v_target;

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

  return jsonb_build_object('status', 'updated', 'user', to_jsonb(v_target));
end;
$$;

revoke all on table public.user_access_audit_logs from anon, authenticated, service_role;
grant select on table public.user_access_audit_logs to service_role;

revoke all on function public.prevent_user_access_audit_mutation() from public, anon, authenticated;
revoke all on function public.change_user_role(text, text, public.user_role, uuid)
  from public, anon, authenticated;
grant execute on function public.change_user_role(text, text, public.user_role, uuid)
  to service_role;
