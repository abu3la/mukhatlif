-- Read-only post-migration verification.
--
-- Run this against a staging project immediately after applying migrations, and
-- again against production after the release. It changes nothing: every
-- statement is a SELECT, so it is safe to re-run at any time.
--
-- Every row it returns should read 'ok'. Anything else is a blocker.

\echo '== 1. migration objects exist =='
select
  case when count(*) = 3 then 'ok' else 'MISSING' end as status,
  'guest tables (0014)' as check,
  count(*) as found,
  3 as expected
from information_schema.tables
where table_schema = 'public'
  and table_name in ('guests', 'guest_socials', 'guest_appearances');

select
  case when count(*) = 2 then 'ok' else 'MISSING' end as status,
  'studio_members invitation columns (0015)' as check,
  count(*) as found,
  2 as expected
from information_schema.columns
where table_schema = 'public'
  and table_name = 'studio_members'
  and column_name in ('status', 'accepted_at');

select
  case when count(*) = 1 then 'ok' else 'MISSING' end as status,
  'accept_studio_member_invitation function (0015)' as check,
  count(*) as found
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'accept_studio_member_invitation';

select
  case when count(*) = 2 then 'ok' else 'MISSING' end as status,
  'form intake tables (0018)' as check,
  count(*) as found,
  2 as expected
from information_schema.tables
where table_schema = 'public'
  and table_name in ('form_submissions', 'form_submission_rate_limits');

select
  case when count(*) = 2 then 'ok' else 'MISSING' end as status,
  'form intake functions (0018)' as check,
  count(*) as found,
  2 as expected
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'claim_form_submission_rate_limit',
    'claim_form_submission_notification'
  );

select
  case when count(*) = 1 then 'ok' else 'MISSING' end as status,
  'homepage weekly episode settings (0022)' as check,
  count(*) as found
from information_schema.tables
where table_schema = 'public'
  and table_name = 'homepage_weekly_episode_settings';

select
  case when count(*) = 2 then 'ok' else 'MISSING' end as status,
  'newsletter consent tables (0021)' as check,
  count(*) as found,
  2 as expected
from information_schema.tables
where table_schema = 'public'
  and table_name in ('newsletter_subscriptions', 'newsletter_consent_events');

select
  case when count(*) = 2 then 'ok' else 'MISSING' end as status,
  'newsletter consent functions (0021)' as check,
  count(*) as found,
  2 as expected
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'record_newsletter_subscription_request',
    'complete_newsletter_subscription_sync'
  );

\echo '== 2. row level security is enabled on every new table =='
select
  case when bool_and(c.relrowsecurity) then 'ok' else 'RLS DISABLED' end as status,
  'RLS on guest tables' as check,
  string_agg(c.relname || '=' || c.relrowsecurity::text, ', ' order by c.relname) as detail
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('guests', 'guest_socials', 'guest_appearances');

select
  case when bool_and(c.relrowsecurity) then 'ok' else 'RLS DISABLED' end as status,
  'RLS on form intake tables' as check,
  string_agg(c.relname || '=' || c.relrowsecurity::text, ', ' order by c.relname) as detail
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('form_submissions', 'form_submission_rate_limits');

select
  case when bool_and(c.relrowsecurity) then 'ok' else 'RLS DISABLED' end as status,
  'RLS on newsletter consent tables' as check,
  string_agg(c.relname || '=' || c.relrowsecurity::text, ', ' order by c.relname) as detail
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('newsletter_subscriptions', 'newsletter_consent_events');

select
  case when bool_and(c.relrowsecurity) then 'ok' else 'RLS DISABLED' end as status,
  'RLS on homepage settings' as check,
  string_agg(c.relname || '=' || c.relrowsecurity::text, ', ' order by c.relname) as detail
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'homepage_weekly_episode_settings';

\echo '== 3. the browser roles hold no direct grant on application data =='
-- The browser reaches application data only through Hono. anon and
-- authenticated must have no privilege on these tables at all.
select
  case when count(*) = 0 then 'ok' else 'LEAKED GRANT' end as status,
  'no anon/authenticated grants' as check,
  coalesce(string_agg(distinct table_name || ':' || grantee || ':' || privilege_type, ', '), 'none')
    as detail
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and table_name in (
    'guests', 'guest_socials', 'guest_appearances',
    'studio_members', 'studio_member_acceptance_audit_logs', 'article_media_assets',
    'form_submissions', 'form_submission_rate_limits',
    'newsletter_subscriptions', 'newsletter_consent_events',
    'homepage_weekly_episode_settings'
  );

\echo '== 4. studio_members backfill is consistent =='
-- Migration 0015 stamps every pre-existing member active as of its creation.
-- A row that is active with no accepted_at, or invited with one, means the
-- backfill did not run or was partially applied.
select
  case when count(*) = 0 then 'ok' else 'INCONSISTENT' end as status,
  'status/accepted_at agree' as check,
  count(*) as offending_rows
from public.studio_members
where (status = 'active' and accepted_at is null)
   or (status = 'invited' and accepted_at is not null);

select
  'info' as status,
  'membership breakdown' as check,
  status as member_status,
  count(*) as members
from public.studio_members
group by status
order by status;

\echo '== 5. there is still at least one administrator =='
select
  case when count(*) > 0 then 'ok' else 'NO ADMIN' end as status,
  'admin account exists' as check,
  count(*) as admins
from public.studio_members
where role_id = 'admin';

\echo '== 6. article publishing backfill (0010) — required before any send =='
select
  case when count(*) = 0 then 'ok' else 'INCOMPLETE BACKFILL' end as status,
  'articles carry canonical content and a version' as check,
  count(*) as offending_rows
from public.articles
where content_json is null
   or content_html is null
   or version is null
   or updated_at is null;

\echo '== 7. every article media reference points at a ready asset =='
select
  case when count(*) = 0 then 'ok' else 'PENDING ASSETS' end as status,
  'no non-ready media assets referenced' as check,
  count(*) as pending_assets
from public.article_media_assets
where status <> 'ready';

\echo '== 8. form permissions and notification state are consistent =='
select
  case when count(*) = 4 then 'ok' else 'MISSING' end as status,
  'admin/editor form permissions' as check,
  count(*) as found,
  4 as expected
from public.role_permissions
where role in ('admin', 'editor')
  and permission::text in ('forms.view', 'forms.manage');

select
  case when count(*) = 0 then 'ok' else 'INCONSISTENT' end as status,
  'notification lease/result state' as check,
  count(*) as offending_rows
from public.form_submissions
where (notification_status = 'sending')
      <> (notification_claim_token is not null and notification_started_at is not null)
   or (notification_status in ('failed', 'unconfigured'))
      <> (notification_error is not null);

\echo '== 9. newsletter consent and local sync state are consistent =='
select
  case when count(*) = 0 then 'ok' else 'INCONSISTENT' end as status,
  'canonical email and sync result state' as check,
  count(*) as offending_rows
from public.newsletter_subscriptions
where email <> lower(btrim(email))
   or (sync_attempt_count = 0) <> (sync_attempted_at is null)
   or (sync_status in ('failed', 'unconfigured')) <> (sync_error is not null);

select
  case when count(*) = 0 then 'ok' else 'INCONSISTENT' end as status,
  'latest consent event belongs to its subscription' as check,
  count(*) as offending_rows
from public.newsletter_subscriptions as subscription
where subscription.latest_consent_event_id is not null
  and not exists (
    select 1
    from public.newsletter_consent_events as event
    where event.id = subscription.latest_consent_event_id
      and event.subscription_id = subscription.id
  );

select
  case when count(*) = 1 then 'ok' else 'MISSING' end as status,
  'append-only consent trigger' as check,
  count(*) as found
from pg_trigger trigger_record
join pg_class table_record on table_record.oid = trigger_record.tgrelid
join pg_namespace namespace_record on namespace_record.oid = table_record.relnamespace
where namespace_record.nspname = 'public'
  and table_record.relname = 'newsletter_consent_events'
  and trigger_record.tgname = 'newsletter_consent_events_append_only'
  and not trigger_record.tgisinternal;

select
  case when count(*) = 0 then 'ok' else 'FORBIDDEN COLUMN' end as status,
  'no provider-status claim is stored' as check,
  count(*) as offending_columns
from information_schema.columns
where table_schema = 'public'
  and table_name = 'newsletter_subscriptions'
  and column_name = 'provider_status';
