-- Unified intake for public sponsorship, partnership, guest, careers,
-- production-service, and guest-review forms. Browsers never access these
-- tables directly; the Worker validates input and uses service_role.

begin;

create table public.form_submissions (
  id text primary key default ('frm-' || replace(gen_random_uuid()::text, '-', '')),
  type text not null,
  payload jsonb not null,
  status text not null default 'new',
  assignee_id text references public.studio_members (id) on delete set null,
  internal_notes text not null default '',
  attachment_refs jsonb not null default '[]'::jsonb,
  source_metadata jsonb not null,
  notification_status text not null default 'pending',
  notification_attempt_count integer not null default 0,
  notification_attempted_at timestamptz,
  notification_error text,
  notification_provider_message_id text,
  notification_claim_token uuid,
  notification_started_at timestamptz,
  status_updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint form_submissions_id_check check (
    id ~ '^frm-[a-zA-Z0-9_-]{8,64}$'
  ),
  constraint form_submissions_type_check check (
    type in (
      'sponsorship',
      'partnership',
      'guest_suggestion',
      'careers',
      'production_service',
      'guest_review'
    )
  ),
  constraint form_submissions_payload_check check (
    jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 32768
  ),
  constraint form_submissions_status_check check (
    status in ('new', 'in_review', 'contacted', 'resolved', 'rejected', 'spam')
  ),
  constraint form_submissions_internal_notes_check check (
    char_length(internal_notes) <= 10000
  ),
  constraint form_submissions_attachment_refs_check check (
    jsonb_typeof(attachment_refs) = 'array'
    and jsonb_array_length(attachment_refs) <= 10
    and pg_column_size(attachment_refs) <= 16384
  ),
  constraint form_submissions_source_metadata_check check (
    jsonb_typeof(source_metadata) = 'object' and pg_column_size(source_metadata) <= 8192
  ),
  constraint form_submissions_notification_status_check check (
    notification_status in ('pending', 'sending', 'sent', 'failed', 'unconfigured')
  ),
  constraint form_submissions_notification_attempt_count_check check (
    notification_attempt_count between 0 and 100000
  ),
  constraint form_submissions_notification_attempt_check check (
    (notification_attempt_count = 0 and notification_attempted_at is null)
    or (notification_attempt_count > 0 and notification_attempted_at is not null)
  ),
  constraint form_submissions_notification_error_check check (
    notification_error is null or char_length(notification_error) between 1 and 120
  ),
  constraint form_submissions_notification_provider_id_check check (
    notification_provider_message_id is null
    or char_length(notification_provider_message_id) between 1 and 255
  ),
  constraint form_submissions_notification_claim_check check (
    (
      notification_status = 'sending'
      and notification_claim_token is not null
      and notification_started_at is not null
    )
    or (
      notification_status <> 'sending'
      and notification_claim_token is null
      and notification_started_at is null
    )
  ),
  constraint form_submissions_notification_result_check check (
    (notification_status in ('failed', 'unconfigured') and notification_error is not null)
    or (notification_status not in ('failed', 'unconfigured') and notification_error is null)
  ),
  constraint form_submissions_resolved_at_check check (
    (status = 'resolved' and resolved_at is not null)
    or (status <> 'resolved' and resolved_at is null)
  )
);

create index form_submissions_status_created_idx
  on public.form_submissions (status, created_at desc);
create index form_submissions_type_status_created_idx
  on public.form_submissions (type, status, created_at desc);
create index form_submissions_assignee_status_idx
  on public.form_submissions (assignee_id, status, created_at desc)
  where assignee_id is not null;
create index form_submissions_notification_idx
  on public.form_submissions (notification_status, notification_started_at)
  where notification_status <> 'sent';

comment on table public.form_submissions is
  'Validated public intake and private Studio workflow. Payload shape is enforced by the API contract.';
comment on column public.form_submissions.attachment_refs is
  'Reserved opaque attachment metadata. Public uploads are intentionally not enabled yet.';
comment on column public.form_submissions.source_metadata is
  'Server-derived request metadata; it never stores a raw client IP address.';

create or replace function public.touch_form_submission_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger form_submissions_touch_updated_at
before update on public.form_submissions
for each row execute function public.touch_form_submission_updated_at();

-- Rate-limit state stores only an HMAC-SHA256 key produced by the Worker,
-- never a raw address. One row is reused per address/form pair, and each claim
-- removes a bounded batch of rows that have been inactive for over 48 hours.
create table public.form_submission_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null,
  request_count integer not null,
  updated_at timestamptz not null default now(),
  constraint form_submission_rate_limits_key_check check (key_hash ~ '^[0-9a-f]{64}$'),
  constraint form_submission_rate_limits_count_check check (request_count between 1 and 101)
);

create index form_submission_rate_limits_updated_idx
  on public.form_submission_rate_limits (updated_at);

create or replace function public.claim_form_submission_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := now();
  v_row public.form_submission_rate_limits%rowtype;
  v_allowed boolean;
  v_retry_after integer;
begin
  if p_key_hash is null
     or p_key_hash !~ '^[0-9a-f]{64}$'
     or p_limit not between 1 and 100
     or p_window_seconds not between 60 and 86400 then
    raise exception 'invalid form rate limit parameters';
  end if;

  -- Keep cleanup bounded so a backlog cannot turn one public request into a
  -- long transaction. SKIP LOCKED lets concurrent claims clean different rows.
  with expired as (
    select key_hash
    from public.form_submission_rate_limits
    where updated_at < v_now - interval '48 hours'
    order by updated_at
    limit 250
    for update skip locked
  )
  delete from public.form_submission_rate_limits as stale
  using expired
  where stale.key_hash = expired.key_hash;

  insert into public.form_submission_rate_limits (
    key_hash,
    window_started_at,
    request_count,
    updated_at
  ) values (
    p_key_hash,
    v_now,
    1,
    v_now
  )
  on conflict (key_hash) do update set
    window_started_at = case
      when form_submission_rate_limits.window_started_at
        <= v_now - make_interval(secs => p_window_seconds)
      then v_now
      else form_submission_rate_limits.window_started_at
    end,
    request_count = case
      when form_submission_rate_limits.window_started_at
        <= v_now - make_interval(secs => p_window_seconds)
      then 1
      else least(form_submission_rate_limits.request_count + 1, p_limit + 1)
    end,
    updated_at = v_now
  returning * into v_row;

  v_allowed := v_row.request_count <= p_limit;
  v_retry_after := case
    when v_allowed then 0
    else greatest(
      1,
      ceil(extract(epoch from (
        v_row.window_started_at + make_interval(secs => p_window_seconds) - v_now
      )))::integer
    )
  end;
  return jsonb_build_object(
    'allowed', v_allowed,
    'retryAfterSeconds', v_retry_after
  );
end;
$$;

-- A lease prevents a manual retry racing the initial save and sending the same
-- notification twice. A stale sender can be reclaimed after the API timeout.
create or replace function public.claim_form_submission_notification(
  p_submission_id text,
  p_stale_before timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_token uuid := gen_random_uuid();
  v_submission public.form_submissions%rowtype;
begin
  if p_submission_id is null or p_stale_before is null then
    return jsonb_build_object('status', 'unavailable');
  end if;

  update public.form_submissions
  set
    notification_status = 'sending',
    notification_attempt_count = least(notification_attempt_count + 1, 100000),
    notification_attempted_at = now(),
    notification_error = null,
    notification_provider_message_id = null,
    notification_claim_token = v_token,
    notification_started_at = now()
  where id = p_submission_id
    and (
      notification_status in ('pending', 'failed', 'unconfigured')
      or (
        notification_status = 'sending'
        and notification_started_at < p_stale_before
      )
    )
  returning * into v_submission;

  if not found then
    return jsonb_build_object('status', 'unavailable');
  end if;
  return jsonb_build_object(
    'status', 'claimed',
    'claimToken', v_token::text,
    'submission', to_jsonb(v_submission)
      - 'notification_claim_token'
      - 'notification_started_at'
  );
end;
$$;

alter table public.form_submissions enable row level security;
alter table public.form_submission_rate_limits enable row level security;

revoke all on table public.form_submissions from anon, authenticated, service_role;
revoke all on table public.form_submission_rate_limits from anon, authenticated, service_role;
grant select, insert, update on table public.form_submissions to service_role;

revoke all on function public.claim_form_submission_rate_limit(text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.claim_form_submission_notification(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_form_submission_rate_limit(text, integer, integer)
  to service_role;
grant execute on function public.claim_form_submission_notification(text, timestamptz)
  to service_role;

-- Seed the operational roles. Custom roles remain opt-in through the existing
-- permission editor/RPC.
insert into public.role_permissions (role, permission) values
  ('admin', 'forms.view'::public.studio_permission),
  ('admin', 'forms.manage'::public.studio_permission),
  ('editor', 'forms.view'::public.studio_permission),
  ('editor', 'forms.manage'::public.studio_permission)
on conflict (role, permission) do nothing;

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

commit;
