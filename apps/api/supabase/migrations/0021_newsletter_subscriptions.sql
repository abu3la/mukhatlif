-- Public newsletter consent is stored before Mailchimp is contacted. The
-- canonical subscription row is deduplicated by normalized email; every
-- consent/request event remains append-only for provenance.

begin;

create table public.newsletter_subscriptions (
  id text primary key default ('nls-' || replace(gen_random_uuid()::text, '-', '')),
  email text not null unique,
  first_name text,
  sync_status text not null default 'pending',
  sync_attempt_count integer not null default 0,
  sync_attempted_at timestamptz,
  sync_error text,
  latest_consent_event_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint newsletter_subscriptions_id_check check (
    id ~ '^nls-[a-zA-Z0-9_-]{8,64}$'
  ),
  constraint newsletter_subscriptions_email_check check (
    email = lower(btrim(email))
    and char_length(email) between 3 and 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint newsletter_subscriptions_first_name_check check (
    first_name is null
    or (first_name = btrim(first_name) and char_length(first_name) between 1 and 160)
  ),
  constraint newsletter_subscriptions_sync_status_check check (
    sync_status in ('pending', 'synced', 'failed', 'unconfigured', 'legacy_unverified')
  ),
  constraint newsletter_subscriptions_sync_attempt_count_check check (
    sync_attempt_count between 0 and 100000
  ),
  constraint newsletter_subscriptions_sync_attempt_check check (
    (sync_attempt_count = 0 and sync_attempted_at is null)
    or (sync_attempt_count > 0 and sync_attempted_at is not null)
  ),
  constraint newsletter_subscriptions_sync_error_check check (
    (
      sync_status in ('failed', 'unconfigured')
      and sync_error is not null
      and sync_error ~ '^[A-Z0-9_]{1,120}$'
    )
    or (
      sync_status not in ('failed', 'unconfigured')
      and sync_error is null
    )
  )
);

create table public.newsletter_consent_events (
  id text primary key default ('nce-' || replace(gen_random_uuid()::text, '-', '')),
  subscription_id text not null references public.newsletter_subscriptions (id),
  request_id uuid not null unique,
  event_kind text not null,
  email text not null,
  first_name text,
  consent_version smallint,
  consent_accepted_at timestamptz,
  source_metadata jsonb not null,
  created_at timestamptz not null default now(),
  constraint newsletter_consent_events_id_check check (
    id ~ '^nce-[a-zA-Z0-9_-]{8,64}$'
  ),
  constraint newsletter_consent_events_id_subscription_unique unique (id, subscription_id),
  constraint newsletter_consent_events_kind_check check (
    event_kind in ('explicit_consent', 'legacy_request')
  ),
  constraint newsletter_consent_events_email_check check (
    email = lower(btrim(email))
    and char_length(email) between 3 and 254
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint newsletter_consent_events_first_name_check check (
    first_name is null
    or (first_name = btrim(first_name) and char_length(first_name) between 1 and 160)
  ),
  constraint newsletter_consent_events_source_check check (
    jsonb_typeof(source_metadata) = 'object'
    and pg_column_size(source_metadata) <= 8192
    and source_metadata ? 'requestId'
    and source_metadata ? 'formVersion'
    and source_metadata ->> 'requestId' = request_id::text
    and source_metadata ->> 'formVersion' = '1'
  ),
  constraint newsletter_consent_events_proof_check check (
    (
      event_kind = 'explicit_consent'
      and consent_version = 1
      and consent_accepted_at is not null
      and not (source_metadata ?| array[
        'legacySource',
        'legacySourceVersion',
        'legacyFormId',
        'legacySubmissionId',
        'legacyMailchimpEvidence'
      ])
    )
    or (
      event_kind = 'legacy_request'
      and consent_version is null
      and consent_accepted_at is null
      and source_metadata ?& array[
        'legacySource',
        'legacySourceVersion',
        'legacyFormId',
        'legacySubmissionId',
        'legacyMailchimpEvidence'
      ]
      and source_metadata ->> 'legacySource' = 'wordpress_elementor'
      and source_metadata ->> 'legacySourceVersion' = '1'
      and source_metadata ->> 'legacyFormId' in ('1678cc0a', '79f340c2')
      and char_length(source_metadata ->> 'legacySubmissionId') between 1 and 160
      and source_metadata ->> 'legacyMailchimpEvidence' in ('ever_success', 'never_success')
    )
  )
);

alter table public.newsletter_subscriptions
  add constraint newsletter_subscriptions_latest_event_fk
  foreign key (latest_consent_event_id, id)
  references public.newsletter_consent_events (id, subscription_id)
  deferrable initially deferred;

create index newsletter_subscriptions_sync_idx
  on public.newsletter_subscriptions (sync_status, updated_at);
create index newsletter_consent_events_subscription_created_idx
  on public.newsletter_consent_events (subscription_id, created_at, id);

comment on table public.newsletter_subscriptions is
  'Canonical newsletter contacts and local Mailchimp request state. synced does not claim provider membership status.';
comment on column public.newsletter_subscriptions.sync_status is
  'Local integration state only. legacy_unverified preserves historical success evidence without asserting current subscription.';
comment on table public.newsletter_consent_events is
  'Append-only proof of explicit consent or a provenance-labelled legacy request.';
-- A later reviewed import may map historical Elementor evidence as follows:
--   ever Mailchimp-success -> legacy_unverified with no provider-status claim
--   never Mailchimp-success -> failed / LEGACY_MAILCHIMP_NEVER_SYNCED
-- No historical rows are inserted by this migration.

create or replace function public.touch_newsletter_subscription_updated_at()
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

create trigger newsletter_subscriptions_touch_updated_at
before update on public.newsletter_subscriptions
for each row execute function public.touch_newsletter_subscription_updated_at();

create or replace function public.prevent_newsletter_consent_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  raise exception 'newsletter consent events are append-only';
end;
$$;

create trigger newsletter_consent_events_append_only
before update or delete on public.newsletter_consent_events
for each row execute function public.prevent_newsletter_consent_event_mutation();

create or replace function public.record_newsletter_subscription_request(
  p_email text,
  p_first_name text,
  p_consent_accepted_at timestamptz,
  p_source_metadata jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := now();
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_first_name text := nullif(btrim(coalesce(p_first_name, '')), '');
  v_request_id uuid;
  v_subscription public.newsletter_subscriptions%rowtype;
  v_event public.newsletter_consent_events%rowtype;
begin
  if char_length(v_email) not between 3 and 254
     or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or (v_first_name is not null and char_length(v_first_name) > 160)
     or p_consent_accepted_at is null
     or p_consent_accepted_at < v_now - interval '5 minutes'
     or p_consent_accepted_at > v_now + interval '5 minutes'
     or p_source_metadata is null
     or jsonb_typeof(p_source_metadata) <> 'object'
     or pg_column_size(p_source_metadata) > 8192
     or p_source_metadata ->> 'formVersion' is distinct from '1'
     or coalesce(p_source_metadata ->> 'requestId', '')
       !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or p_source_metadata ?| array[
       'legacySource',
       'legacySourceVersion',
       'legacyFormId',
       'legacySubmissionId',
       'legacyMailchimpEvidence'
     ]
     or exists (
       select 1
       from jsonb_object_keys(p_source_metadata) as supplied(key)
       where supplied.key <> all(array[
         'requestId',
         'formVersion',
         'clientSurface',
         'requestOrigin',
         'referrerOrigin',
         'referrerPath',
         'userAgent',
         'countryCode'
       ]::text[])
     ) then
    raise exception 'invalid newsletter subscription request';
  end if;

  begin
    v_request_id := (p_source_metadata ->> 'requestId')::uuid;
  exception when invalid_text_representation then
    raise exception 'invalid newsletter subscription request id';
  end;

  select * into v_event
  from public.newsletter_consent_events
  where request_id = v_request_id;

  if found then
    if v_event.event_kind <> 'explicit_consent'
       or v_event.email <> v_email
       or v_event.first_name is distinct from v_first_name
       or v_event.consent_accepted_at is distinct from p_consent_accepted_at
       or v_event.source_metadata <> p_source_metadata then
      raise exception 'newsletter request id was reused with different data';
    end if;
    select * into strict v_subscription
    from public.newsletter_subscriptions
    where id = v_event.subscription_id;
    return jsonb_build_object(
      'subscription', to_jsonb(v_subscription),
      'consentEvent', to_jsonb(v_event) - 'request_id'
    );
  end if;

  insert into public.newsletter_subscriptions (
    email,
    first_name,
    sync_status,
    sync_error
  ) values (
    v_email,
    v_first_name,
    'pending',
    null
  )
  on conflict (email) do update set
    first_name = coalesce(excluded.first_name, newsletter_subscriptions.first_name),
    sync_status = 'pending',
    sync_error = null
  returning * into v_subscription;

  insert into public.newsletter_consent_events (
    subscription_id,
    request_id,
    event_kind,
    email,
    first_name,
    consent_version,
    consent_accepted_at,
    source_metadata,
    created_at
  ) values (
    v_subscription.id,
    v_request_id,
    'explicit_consent',
    v_email,
    v_first_name,
    1,
    p_consent_accepted_at,
    p_source_metadata,
    v_now
  )
  returning * into v_event;

  update public.newsletter_subscriptions
  set latest_consent_event_id = v_event.id
  where id = v_subscription.id
  returning * into v_subscription;

  return jsonb_build_object(
    'subscription', to_jsonb(v_subscription),
    'consentEvent', to_jsonb(v_event) - 'request_id'
  );
end;
$$;

create or replace function public.complete_newsletter_subscription_sync(
  p_subscription_id text,
  p_consent_event_id text,
  p_status text,
  p_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_subscription public.newsletter_subscriptions%rowtype;
begin
  if p_status not in ('synced', 'failed', 'unconfigured')
     or (
       p_status in ('failed', 'unconfigured')
       and coalesce(p_error_code, '') !~ '^[A-Z0-9_]{1,120}$'
     )
     or (p_status = 'synced' and p_error_code is not null) then
    raise exception 'invalid newsletter sync result';
  end if;

  update public.newsletter_subscriptions
  set
    sync_status = p_status,
    sync_attempt_count = least(sync_attempt_count + 1, 100000),
    sync_attempted_at = now(),
    sync_error = p_error_code
  where id = p_subscription_id
    and latest_consent_event_id = p_consent_event_id
    and sync_status = 'pending'
  returning * into v_subscription;

  if not found then return null; end if;
  return to_jsonb(v_subscription);
end;
$$;

alter table public.newsletter_subscriptions enable row level security;
alter table public.newsletter_consent_events enable row level security;

revoke all on table public.newsletter_subscriptions from anon, authenticated, service_role;
revoke all on table public.newsletter_consent_events from anon, authenticated, service_role;
grant select on table public.newsletter_subscriptions to service_role;
grant select on table public.newsletter_consent_events to service_role;

revoke all on function public.record_newsletter_subscription_request(
  text,
  text,
  timestamptz,
  jsonb
) from public, anon, authenticated;
revoke all on function public.complete_newsletter_subscription_sync(
  text,
  text,
  text,
  text
) from public, anon, authenticated;
grant execute on function public.record_newsletter_subscription_request(
  text,
  text,
  timestamptz,
  jsonb
) to service_role;
grant execute on function public.complete_newsletter_subscription_sync(
  text,
  text,
  text,
  text
) to service_role;

commit;
