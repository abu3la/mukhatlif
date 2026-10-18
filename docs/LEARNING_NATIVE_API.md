# Native learning in the existing API

## Architecture

The Hono API now owns learning. The separate Python LMS service and its URL/key/secret configuration were removed. Both deployment runtimes use the same TypeScript rules, Supabase repositories and private R2 storage adapter.

- Supabase Auth UUIDs identify learners. Existing account provisioning and Studio administrator authorization remain mandatory.
- Migration `0025_learning.sql` adds private courses, enrollments, assets and expiring media tickets. Browser database roles cannot read or mutate these tables or execute the mutation functions.
- The catalogue exposes descriptions, curriculum titles and an optional trailer. It does not expose lesson bodies, private asset paths or quiz answers. Enrollment is required for the workspace and private media.
- Simulated checkout creates one enrollment and order per course/customer. The database reads the current price while holding the course lock. No gateway, charge, payment card or payment webhook exists.
- Progress saves use revision compare-and-set. Concurrent device saves reapply to the latest state. Watched intervals are merged without double counting. Seeking does not complete a video. Reading progress never regresses.
- Lessons unlock sequentially after completing earlier lesson content. Quiz/worksheet submission requires completing the associated lesson, or all lessons for course-level assessments. Certificate issuance requires every lesson, quiz and required graded worksheet.
- Studio manages courses, lessons, assessments, private uploads and worksheet grading. Learning requirements are frozen after first enrollment; catalogue copy remains editable.
- Course descriptions, overviews and lesson bodies use the existing blog editor. Structured documents persist alongside derived plain text. The API validates documents and generates escaped, allowlisted HTML using the existing article renderer. Browser-provided HTML is never stored or trusted. Course editors expose text formatting, headings, lists, quotes, links and alignment; video/files use the dedicated course upload fields, not article advertisements or public article assets.
- Private uploads use the existing `MEDIA` R2 binding (the Hostinger S3 adapter implements the same contract), 5 MiB multipart parts, per-file limits of 5 GiB for MP4/WebM, 1 GiB for MP3 and 100 MiB for PDF, ownership checks and initial file-signature verification. The environment prefixes isolate development and production objects. Media tickets expire in one hour; each read rechecks course publication, file ownership and enrollment, then streams the requested byte range. Only the exact published trailer is anonymous.

Learner bookmarks persist in enrollment state, scoped to the authenticated account and lesson. A stable client UUID makes repeated saves idempotent; timestamp and note limits are validated on the server. Bookmarks do not count as watched progress.

## Configuration and release

No additional LMS host or API credential is needed. Use the existing matching Supabase URL/service key and private `MEDIA` storage. Set `LEARNING_SIMULATION_ENABLED=true` explicitly. The approved Hostinger release launcher defaults this flag to `true` for the owner-requested simulated checkout; an explicit runtime `false` still disables it. No real payment is enabled. Keep remote `ALLOW_DEV_AUTH=false`. Media links use the configured `MEDIA_PUBLIC_ORIGIN`.

1. Run the guarded development migration preflight with a fresh supported database login:

   ```sh
   node apps/api/scripts/migrate-learning-development.mjs --env-file /private/path/database.env --cli-login-role
   ```

2. Apply with a new private backup directory outside this checkout. The script verifies the exact development project, customer schema prerequisite, full database/Auth dump, RLS/browser denial and unchanged existing Auth/user/article/episode fingerprints:

   ```sh
   node apps/api/scripts/migrate-learning-development.mjs --env-file /private/path/database.env --cli-login-role --backup-dir /private/path/new-learning-backup --apply
   ```

3. Deploy API through the existing guarded development script. Require `/health/learning-schema` to return `{ "ready": true }` before publishing consumers.
4. Verify a real confirmed Supabase customer, private R2 upload/range playback, logout/relogin persistence, worksheet grading and certificate issuance on development.
5. Promote the same verified source through the normal production release process, with a separate fresh production backup and reviewed migration. Only API, Studio and staging are authorized production targets. Do not touch apex DNS or copy development data into production.

Rollback application code first and retain additive tables/media. Never drop tables with learner data or replace production with the local test database. Periodic maintenance may remove expired media-ticket rows and abort old unfinished multipart uploads; never delete ready course objects as part of that cleanup.

## Verification recorded October 15, 2026

- API 671 tests, Studio 467 tests and Web 198 tests passed (1336 total). API Node bundle, Studio production build and Web production build passed. Type checks and focused lint passed.
- The migration was executed on local PostgreSQL (PGlite), including browser privilege denial, idempotent enrollment, authoritative pricing, curriculum locking and optimistic updates.
- A 24-check local HTTP acceptance pass exercised the actual Hono routes and Supabase client against PostgreSQL: rich-document save/render, private content denial, declined/successful checkout, idempotency, progress, quiz gating/grading, assignment submission/admin grading, certificate gating, account isolation, library, multipart upload and HTTP 206 byte comparisons.
- Studio browser editing saved bold text and preserved it across reload. The student browser rendered the rich lesson, saved reading progress automatically, passed the quiz, submitted the worksheet and received a certificate only after Studio grading.
- Additional private-media checks passed for enrollment denial, course ownership, suffix byte ranges, invalid-range 416, private cache headers and immediate publication revocation. Browser trailer playback reached readyState 4 with advancing playback and no media error. Desktop and 390-pixel mobile layout were inspected.
- Historical October 15 blocker: remote database and REST checks failed DNS resolution (`ENOTFOUND`). This was resolved by restoring the paused development project; migration and deployment completed October 17 as recorded below.

## Local preview

Run `pnpm exec tsx tools/learning-preview/native-api.mts` for the loopback-only acceptance API, then `node tools/learning-preview/server.mjs` for the learner preview. The local harness uses the real Hono routes, Supabase client and PostgreSQL schema, but fixture identities, a limited local REST test adapter and local media storage. It is never deployed and is not evidence of remote Supabase/R2 readiness. The preview course is `/courses/learning-native-preview`.

Run `node tools/learning-preview/smoke.mjs /private/path/test.mp4` against that loopback API for repeatable HTTP acceptance. It creates uniquely named local courses and tests formatting, checkout, progress, grading, certificates, account isolation and private media. Without an MP4 argument it explicitly skips the media portion.

## Development release October 17, 2026

Supabase connectivity is restored, migration 0025 is applied, and native learning is deployed to all three development Workers. See `LEARNING_DEVELOPMENT_RELEASE_20261017.md` for verification and deployment receipts. Production remains unchanged.
