# Mailchimp Publishing Runbook

## Required Worker Settings

Campaign operations are disabled unless `MAILCHIMP_CAMPAIGNS_ENABLED` is exactly
`true`. Stored credentials remain inert while the switch is absent or `false`.
When enabled, configure all seven identity values together. Article and email
preview remain available while campaign operations are disabled.

| Variable                         | Purpose                                                                |
| -------------------------------- | ---------------------------------------------------------------------- |
| `MAILCHIMP_CAMPAIGNS_ENABLED`    | Explicit kill switch. Only `true` permits Mailchimp campaign calls.    |
| `MAILCHIMP_API_KEY`              | Secret Marketing API credential. Store with `wrangler secret put`.     |
| `MAILCHIMP_SERVER_PREFIX`        | Mailchimp data-center prefix, such as `us1`.                           |
| `MAILCHIMP_AUDIENCE_ID`          | Fixed audience target. Never returned to the browser.                  |
| `MAILCHIMP_RECIPIENT_SEGMENT_ID` | Numeric ID of the static Mailchimp tag named exactly `nlpage`.         |
| `MAILCHIMP_FROM_NAME`            | Verified sender name.                                                  |
| `MAILCHIMP_REPLY_TO`             | Verified reply address.                                                |
| `PUBLIC_WEB_URL`                 | HTTPS public site origin used to make article links absolute in email. |
| `MEDIA_PUBLIC_ORIGIN`            | HTTPS Worker origin used for immutable image and video-poster URLs.    |

When the switch is enabled, partial configuration is treated as an API
configuration error. `PUBLIC_WEB_URL` may use HTTP only for a local development
host. When the switch is absent or `false`, capability, draft creation,
reconciliation, and sending make no Mailchimp provider request.

The API resolves `MAILCHIMP_RECIPIENT_SEGMENT_ID` from Mailchimp before creating a campaign and verifies that it is a static segment named exactly `nlpage`. Campaign creation uses `recipients.segment_opts.saved_segment_id`; campaign synchronization, reconciliation, and sending also reject any stored campaign whose segment has drifted. There is no whole-audience fallback. Obtain the real segment ID from the Mailchimp account after access is restored; never invent or copy an ID from another audience.

## Pre-deployment Checks

1. Apply `0010_unified_article_publishing.sql` and `0011_article_media_assets.sql` to a staging Supabase project.
2. Confirm the migration backfilled `content_json`, `content_html`, `version`, and `updated_at` for every article.
3. Confirm the configured Mailchimp audience name, the `nlpage` recipient tag, and its recipient count appear separately in the Studio.
4. Create a test article and inspect both web and email previews.
5. Create the Mailchimp draft and confirm a second synchronization reuses the same campaign.
6. Verify the Mailchimp checklist passes for a test audience.
7. Send only to an approved test audience before enabling the production audience.

## Operational Recovery

- `sending`: use the Studio reconciliation action. It reads Mailchimp status without sending again. If Mailchimp still reports a draft, a fresh private send lease remains fenced because another request may be between its checklist and send calls. A draft is made retryable only after the 15-minute lease expires and reconciliation atomically confirms and releases that exact stale lease.
- `sync_unknown`: do not retry. An initial campaign creation may have succeeded without returning its identifier. Review Mailchimp and the database, then resolve the record manually after identifying whether a remote draft exists.
- `needsSync: true`: synchronize the existing Mailchimp draft before sending.
- `MAILCHIMP_AUDIENCE_UNVERIFIED`: confirm the API credential can read the configured audience. No send action has been called.
- `MAILCHIMP_RECIPIENT_TARGET_UNVERIFIED`: confirm the configured segment exists as a static tag named `nlpage`. No send action has been called.
- `MAILCHIMP_AUDIENCE_CONFIRMATION_MISMATCH`: reload the audience summary and repeat the explicit confirmation. The configured audience changed after the previous confirmation.
- `MAILCHIMP_AUDIENCE_MISMATCH`: the stored campaign targets a different audience than the current server configuration. Do not send; review the campaign and article record.
- `MAILCHIMP_RECIPIENT_SEGMENT_MISMATCH`: the stored campaign targets a different segment. Do not send; review the campaign in Mailchimp.
- `NEWSLETTER_CONFIRMATION_STALE`: reload the article and open a new confirmation. The confirmed article version or campaign changed before the send claim.
- `NEWSLETTER_SEND_STATE_UNKNOWN`: do not send again. The Mailchimp send request may have succeeded; use reconciliation until the remote state is known.
- `NEWSLETTER_SEND_LEASE_LOST`: reload before taking another action. A stale send worker lost its private lease and was stopped before calling Mailchimp.
- `MAILCHIMP_CHECKLIST_FAILED`: resolve the checklist in Mailchimp, then retry the explicit send action.

Never clear `sync_unknown` merely to retry. That can create duplicate campaigns.

## Compliance Content

Both HTML and plain-text email variants include Mailchimp merge tags for the audience address, profile update, and unsubscribe links. The address itself is supplied by the configured Mailchimp audience and is not hard-coded in the application.
