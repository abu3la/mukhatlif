-- Studio invitation acceptance and initial password setup.
--
-- ADR 0002 left invite-link acceptance unimplemented. A Studio member row is
-- created the moment an invitation is sent, so until now an invited person was
-- indistinguishable from an active operator. This migration makes acceptance an
-- explicit, audited, one-time state change.
--
-- Writes to studio_members remain RPC-only: service_role holds SELECT alone, so
-- acceptance runs inside a security-definer function under the same advisory
-- lock as every other access-control mutation.

begin;

alter table public.studio_members
  add column status text not null default 'active',
  add column accepted_at timestamptz;

alter table public.studio_members
  add constraint studio_members_status_check check (status in ('invited', 'active'));

-- An active member must record when acceptance happened; an invited one must not.
alter table public.studio_members
  add constraint studio_members_accepted_at_check check (
    (status = 'active' and accepted_at is not null)
    or (status = 'invited' and accepted_at is null)
  );

-- Rows that predate this migration were provisioned before invitations existed
-- or have already signed in, so they are active as of their creation.
update public.studio_members
set accepted_at = created_at
where accepted_at is null;

create index studio_members_invited_idx
  on public.studio_members (created_at)
  where status = 'invited';

comment on column public.studio_members.status is
  'invited until the person accepts the emailed link and sets a password.';

create table public.studio_member_acceptance_audit_logs (
  id uuid primary key default gen_random_uuid(),
  studio_member_id text not null references public.studio_members (id) on delete restrict,
  auth_user_id uuid not null,
  request_id uuid not null unique,
  created_at timestamptz not null default now()
);

create index studio_member_acceptance_audit_logs_created_at_idx
  on public.studio_member_acceptance_audit_logs (created_at desc);

create index studio_member_acceptance_audit_logs_member_idx
  on public.studio_member_acceptance_audit_logs (studio_member_id, created_at desc);

alter table public.studio_member_acceptance_audit_logs enable row level security;
revoke all on table public.studio_member_acceptance_audit_logs
  from anon, authenticated, service_role;
grant select on table public.studio_member_acceptance_audit_logs to service_role;

-- A newly invited member starts pending. Everything else in the provisioning
-- contract is unchanged from migration 0009.
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
    locale,
    status,
    accepted_at
  ) values (
    v_target_id,
    p_auth_user_id,
    v_display_name,
    v_email,
    p_role,
    p_locale,
    'invited',
    null
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

/**
 * Marks the invitation for one verified Auth identity accepted.
 *
 * The caller must already have set the password through the Auth admin API.
 * Acceptance is deliberately one-time: a member who is already active returns
 * `already_active` so a replayed request cannot be used to reopen the
 * password-setup path for an established account.
 */
create or replace function public.accept_studio_member_invitation(
  p_auth_user_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_member public.studio_members%rowtype;
  v_role public.studio_roles%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('mukhtalif:studio-access-control', 0));

  if p_auth_user_id is null or p_request_id is null then
    return jsonb_build_object('status', 'invalid_input');
  end if;

  select * into v_member
  from public.studio_members
  where auth_user_id = p_auth_user_id
  for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_member.status = 'active' then
    return jsonb_build_object('status', 'already_active');
  end if;

  update public.studio_members
  set status = 'active', accepted_at = now()
  where id = v_member.id
  returning * into v_member;

  insert into public.studio_member_acceptance_audit_logs (
    studio_member_id,
    auth_user_id,
    request_id
  ) values (
    v_member.id,
    p_auth_user_id,
    p_request_id
  );

  select * into v_role from public.studio_roles where id = v_member.role_id;

  return jsonb_build_object(
    'status', 'accepted',
    'member', to_jsonb(v_member) || jsonb_build_object('role_name', coalesce(v_role.name, v_member.role_id))
  );
end;
$$;

revoke all on function public.accept_studio_member_invitation(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.accept_studio_member_invitation(uuid, uuid) to service_role;

commit;
