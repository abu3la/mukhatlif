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

\echo '== 2. row level security is enabled on every new table =='
select
  case when bool_and(c.relrowsecurity) then 'ok' else 'RLS DISABLED' end as status,
  'RLS on guest tables' as check,
  string_agg(c.relname || '=' || c.relrowsecurity::text, ', ' order by c.relname) as detail
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('guests', 'guest_socials', 'guest_appearances');

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
    'studio_members', 'studio_member_acceptance_audit_logs', 'article_media_assets'
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
