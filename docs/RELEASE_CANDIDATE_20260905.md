# September 5 release candidate: PR only, no deployment

## Authorization and scope

The owner authorized deleting production test episodes and preparing a PR into
`abu3la/mukhatlif:main` with the latest shared API, Studio and Web improvements.
Merge and manual Hostinger deployment are a subsequent step. Do not deploy this
branch or copy the development database to production.

Included: resumable same-page multipart audio upload with explicit Upload action,
progress/pause/resume/cancel, shared Node/R2 adapter support, verified YouTube ID
field and immediate embedded player, design-token rounded corners, card
thumbnails, environment-aware Studio website shortcut, and development archive
tooling. The PR also includes the earlier dev commits for password email
reauthentication. No archive data, credentials or test recordings are committed.

## Production cleanup completed

- Target: Supabase `pacpdxvujkjvnaeeuute` only.
- Deleted exact original seed IDs: `ep-1001`, `ep-1002`, `ep-1003`, `ep-2001`,
  `ep-2002`, `ep-3001`, `ep-3002`, `ep-4001`, `ep-5001`.
- Six were published; three were draft/scheduled/archived. All nine matched
  original migration titles and sample SoundHelix/null URLs, with no R2 key.
- One associated playback-progress row was removed; no guest appearances existed.
- Counts: 845 -> 836 episodes. The full JSON fingerprint of every other episode
  was unchanged. The public production API now returns 836 RSS episodes and no
  non-RSS seed episodes. No R2 object was deleted or rewritten.
- A fresh full database/Auth custom dump was taken and its table-of-contents
  verified before the transaction. Restricted backups and exact row before-images:
  `/Users/abu3la/dev/mukhtalif/backups/supabase/20260905-production-seed-cleanup-pQlnYS/`.
- Receipt timestamp: `2026-09-05T10:55:19.618Z`. Dump SHA-256:
  `a29935007499259b11f45fd1674254c797693c04f073448f29d1ecb9f58d390e`.
- Recovery: review `before.json` and restore just the nine episode rows, then the
  one playback-progress row, in a transaction. Do not restore the full production
  database over newer work. The full dump is a separate recovery fallback.

## Release gates still required

1. Review the PR and its exact SHA; all GitHub checks must pass before merge.
2. Complete the real browser multipart-upload acceptance described in
   `STUDIO_AUDIO_UPLOAD_20260905.md`. Automated tests are not that proof.
3. Before the API release, back up production again and manually apply reviewed
   migration `0023_episode_youtube.sql` with the proper migration ledger entry.
   It adds a nullable column only, not episode rows or links. It remains unapplied
   in production during PR preparation.
4. Do not copy development recordings, test drafts or the full development DB.
   Production has 836 genuine RSS episodes; development has later RSS additions
   and reviewed video/R2 associations that are NOT promoted by a code release.
   Any later approved metadata promotion requires a separate identity-checked,
   real-archive-only plan and before-images. Until then a null YouTube ID produces
   no video section; new code does not invent or transfer links.
5. Confirm production Supabase secure password change/email delivery settings
   before enabling the incoming account-security flow for production operators.
6. Use the verified merged `main` SHA for manual Hostinger API -> Studio -> Web
   deployment, and preserve current production secrets. Smoke-test Node health,
   auth/CORS, media reads, then Studio direct routes and staging global noindex.
   Keep `mukhtalif.net`, DNS and Mailchimp enablement unchanged.

## Local verification

API 489 tests, Studio 454 tests, Web 69 tests, archive tooling 68 tests and five
deployment-helper tests pass. Workspace TypeScript/ESLint and archive TypeScript
pass. Development video rendering/playback evidence remains in
`EPISODE_DIRECT_VIDEO_20260905.md`. No new UI design changes were made in this
release-preparation step.

All three guarded Hostinger build targets also passed locally using the inert
CI environment values from `.github/workflows/verify.yml`. No built artifact was
uploaded. These are local build checks on Node 26 targeting Node 22; GitHub's
Node 22 checks and the deployment-time production configuration checks remain
separate gates. Known local credential values were scanned against all 106
candidate changed files before the release record was added: zero matches.
