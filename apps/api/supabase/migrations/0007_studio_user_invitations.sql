-- Studio users are invited through Supabase Auth by the Hono API. This
-- migration atomically links the new immutable Auth UUID to an application
-- profile and appends an audit record. The service-role secret never crosses
-- the server boundary.

do $$
begin
  if exists (
    select 1
    from public.users
    group by lower(btrim(email))
    having count(*) > 1
  ) then
    raise exception 'users contain case-insensitive duplicate email addresses';
  end if;
end;
$$;

update public.users
set email = lower(btrim(email))
where email <> lower(btrim(email));

alter table public.users
  add constraint users_email_canonical
  check (email = lower(btrim(email)) and char_length(email) between 3 and 254);

create unique index users_email_lower_unique
  on public.users (lower(email));

create table public.user_invitation_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id text not null references public.users (id) on delete restrict,
  target_user_id text not null references public.users (id) on delete restrict,
  invited_email text not null,
  assigned_role public.user_role not null,
  locale text not null check (locale in ('ar', 'en')),
  request_id uuid not null unique,
  created_at timestamptz not null default now()
);

create index user_invitation_audit_logs_created_at_idx
  on public.user_invitation_audit_logs (created_at desc);

create index user_invitation_audit_logs_target_idx
  on public.user_invitation_audit_logs (target_user_id, created_at desc);

alter table public.user_invitation_audit_logs enable row level security;

create trigger user_invitation_audit_logs_append_only
before update or delete on public.user_invitation_audit_logs
for each row execute function public.prevent_user_access_audit_mutation();

create or replace function public.provision_invited_user(
  p_actor_user_id text,
  p_auth_user_id uuid,
  p_display_name text,
  p_email text,
  p_role public.user_role,
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
  v_target public.users%rowtype;
  v_email text := lower(btrim(p_email));
  v_display_name text := btrim(p_display_name);
  v_target_id text := 'usr-' || replace(gen_random_uuid()::text, '-', '');
begin
  -- Serialize profile provisioning. The Auth invitation happens before this
  -- transaction; losing requests are rolled back from Auth by Hono.
  perform pg_advisory_xact_lock(hashtextextended('mukhtalif:user-invitation', 0));

  select * into v_actor
  from public.users
  where id = p_actor_user_id
  for update;

  if not found or v_actor.role <> 'admin'::public.user_role then
    return jsonb_build_object('status', 'forbidden');
  end if;

  if p_auth_user_id is null
     or p_request_id is null
     or p_display_name is null
     or p_email is null
     or p_role is null
     or p_locale is null
     or p_locale not in ('ar', 'en')
     or char_length(v_display_name) not between 2 and 100
     or char_length(v_email) not between 3 and 254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    return jsonb_build_object('status', 'invalid_input');
  end if;

  if exists (
    select 1 from public.users where lower(email) = v_email
  ) then
    return jsonb_build_object('status', 'duplicate_email');
  end if;

  if exists (
    select 1 from public.users where auth_user_id = p_auth_user_id
  ) then
    return jsonb_build_object('status', 'duplicate_auth_identity');
  end if;

  insert into public.users (
    id,
    auth_user_id,
    display_name,
    email,
    role,
    locale
  ) values (
    v_target_id,
    p_auth_user_id,
    v_display_name,
    v_email,
    p_role,
    p_locale
  )
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

  return jsonb_build_object('status', 'created', 'user', to_jsonb(v_target));
end;
$$;

revoke all on table public.user_invitation_audit_logs
  from anon, authenticated, service_role;
grant select on table public.user_invitation_audit_logs to service_role;

revoke all on function public.provision_invited_user(
  text,
  uuid,
  text,
  text,
  public.user_role,
  text,
  uuid
) from public, anon, authenticated;
grant execute on function public.provision_invited_user(
  text,
  uuid,
  text,
  text,
  public.user_role,
  text,
  uuid
) to service_role;
