-- One canonical editor document powers the public article and its Mailchimp letter.
-- Web publication and newsletter delivery retain independent state.

alter table articles
  add column excerpt_ar text,
  add column cover_alt text,
  add column content_json jsonb,
  add column content_html text,
  add column seo_title text,
  add column seo_description text,
  add column canonical_url text,
  add column social_title text,
  add column social_description text,
  add column social_image_url text,
  add column no_index boolean not null default false,
  add column newsletter_enabled boolean not null default false,
  add column newsletter_subject text,
  add column newsletter_preheader text,
  add column newsletter_status text not null default 'not_started',
  add column mailchimp_campaign_id text,
  add column newsletter_synced_version integer,
  add column newsletter_sync_started_at timestamptz,
  add column newsletter_sync_token uuid,
  add column newsletter_send_started_at timestamptz,
  add column newsletter_send_token uuid,
  add column newsletter_sent_at timestamptz,
  add column version integer not null default 1,
  add column updated_at timestamptz not null default now();

-- Existing content is trusted only as text, then represented in the same document shape
-- used by the new editor. HTML is escaped during backfill.
update articles
set
  content_json = jsonb_build_object(
    'type', 'doc',
    'content', jsonb_build_array(
      case
        when body_ar = '' then jsonb_build_object('type', 'paragraph')
        else jsonb_build_object(
          'type', 'paragraph',
          'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', body_ar))
        )
      end
    )
  ),
  content_html = '<div dir="rtl" lang="ar"><p>'
    || replace(replace(replace(body_ar, '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
    || '</p></div>',
  cover_alt = case when cover_url is not null then title_ar else cover_alt end,
  updated_at = created_at;

alter table articles
  alter column content_json set not null,
  alter column content_html set not null,
  add constraint articles_content_document_check check (
    jsonb_typeof(content_json) = 'object' and content_json ->> 'type' = 'doc'
  ),
  add constraint articles_cover_alt_check check (cover_url is null or nullif(trim(cover_alt), '') is not null),
  add constraint articles_version_check check (version >= 1),
  add constraint articles_newsletter_synced_version_check check (
    newsletter_synced_version is null or (
      newsletter_synced_version >= 1 and newsletter_synced_version <= version
    )
  ),
  add constraint articles_newsletter_status_check check (
    newsletter_status in ('not_started', 'draft', 'syncing', 'sync_unknown', 'campaign_created', 'sending', 'sent')
  ),
  add constraint articles_newsletter_sent_check check (
    newsletter_status <> 'sent' or (
      mailchimp_campaign_id is not null and newsletter_sent_at is not null
    )
  ),
  add constraint articles_newsletter_send_lease_check check (
    (
      newsletter_status = 'sending'
      and newsletter_send_started_at is not null
      and newsletter_send_token is not null
    )
    or (
      newsletter_status <> 'sending'
      and newsletter_send_started_at is null
      and newsletter_send_token is null
    )
  );

create unique index articles_mailchimp_campaign_unique_idx
  on articles (mailchimp_campaign_id)
  where mailchimp_campaign_id is not null;

create index articles_newsletter_status_idx on articles (newsletter_status);
