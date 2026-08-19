# Mailchimp Publishing Runbook

## Required Worker Settings

Configure all values together. If every value is absent, local article and email preview remain available but live Mailchimp operations are disabled.

| Variable                  | Purpose                                                                |
| ------------------------- | ---------------------------------------------------------------------- |
| `MAILCHIMP_API_KEY`       | Secret Marketing API credential. Store with `wrangler secret put`.     |
| `MAILCHIMP_SERVER_PREFIX` | Mailchimp data-center prefix, such as `us1`.                           |
| `MAILCHIMP_AUDIENCE_ID`   | Fixed audience target. Never returned to the browser.                  |
| `MAILCHIMP_FROM_NAME`     | Verified sender name.                                                  |
| `MAILCHIMP_REPLY_TO`      | Verified reply address.                                                |
| `PUBLIC_WEB_URL`          | HTTPS public site origin used to make article links absolute in email. |
| `MEDIA_PUBLIC_ORIGIN`     | HTTPS Worker origin used for immutable image and video-poster URLs.    |

Partial configuration is treated as an API configuration error. `PUBLIC_WEB_URL` may use HTTP only for a local development host.

## Pre-deployment Checks

1. Apply `0010_unified_article_publishing.sql` and `0011_article_media_assets.sql` to a staging Supabase project.
2. Confirm the migration backfilled `content_json`, `content_html`, `version`, and `updated_at` for every article.
3. Confirm the configured Mailchimp audience name and recipient count appear in the Studio.
4. Create a test article and inspect both web and email previews.
5. Create the Mailchimp draft and confirm a second synchronization reuses the same campaign.
6. Verify the Mailchimp checklist passes for a test audience.
7. Send only to an approved test audience before enabling the production audience.

## Operational Recovery

- `sending`: use the Studio reconciliation action. It reads Mailchimp status without sending again. If Mailchimp still reports a draft, a fresh private send lease remains fenced because another request may be between its checklist and send calls. A draft is made retryable only after the 15-minute lease expires and reconciliation atomically confirms and releases that exact stale lease.
- `sync_unknown`: do not retry. An initial campaign creation may have succeeded without returning its identifier. Review Mailchimp and the database, then resolve the record manually after identifying whether a remote draft exists.
- `needsSync: true`: synchronize the existing Mailchimp draft before sending.
- `MAILCHIMP_AUDIENCE_UNVERIFIED`: confirm the API credential can read the configured audience. No send action has been called.
- `MAILCHIMP_AUDIENCE_CONFIRMATION_MISMATCH`: reload the audience summary and repeat the explicit confirmation. The configured audience changed after the previous confirmation.
- `MAILCHIMP_AUDIENCE_MISMATCH`: the stored campaign targets a different audience than the current server configuration. Do not send; review the campaign and article record.
- `NEWSLETTER_CONFIRMATION_STALE`: reload the article and open a new confirmation. The confirmed article version or campaign changed before the send claim.
- `NEWSLETTER_SEND_STATE_UNKNOWN`: do not send again. The Mailchimp send request may have succeeded; use reconciliation until the remote state is known.
- `NEWSLETTER_SEND_LEASE_LOST`: reload before taking another action. A stale send worker lost its private lease and was stopped before calling Mailchimp.
- `MAILCHIMP_CHECKLIST_FAILED`: resolve the checklist in Mailchimp, then retry the explicit send action.

Never clear `sync_unknown` merely to retry. That can create duplicate campaigns.

## Compliance Content

Both HTML and plain-text email variants include Mailchimp merge tags for the audience address, profile update, and unsubscribe links. The address itself is supplied by the configured Mailchimp audience and is not hard-coded in the application.
