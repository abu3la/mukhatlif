# Mukhtalif deployment architecture

This file is the operational source of truth for every agent working in this
repository. Read it before changing deployment, environment, DNS, email,
storage, authentication, or content-import code. When implementation and this
file disagree, stop and reconcile the difference instead of guessing.

## September 5 production cleanup and PR preparation

The owner authorized deleting production test episodes and preparing a PR into
`abu3la/mukhatlif:main`; merge and manual deployment come afterwards, not now.
The nine original seed episodes (six published, three other states) were deleted
from production after a fresh verified full database/Auth backup, together with
one associated playback-progress row. All 836 genuine episode rows are unchanged,
and the production public API returns 836 RSS episodes with no seed IDs.
No R2 objects, Auth accounts, development data or deployed application code were
changed. See `docs/RELEASE_CANDIDATE_20260905.md` for exact IDs, private recovery
artifacts and outstanding release gates. Production migration 0023, API/Studio/Web
deployment and promotion of development archive metadata remain pending. Historical
development-only authorizations below are superseded only for this explicit PR
and seed-cleanup scope; never copy the development database into production.

## Direct episode video (2026-09-05)

Development episode pages now show the YouTube iframe immediately, with headings
**الاستماع للحلقة** and **مشاهدة الحلقة**. No reveal button, autoplay or custom
external YouTube watch link. Starting audio pauses video without hiding it;
video playback pauses audio through the official IFrame API. Premium/source-ID
guards remain. This supersedes historical click-to-reveal/unload-on-audio notes.
See `docs/EPISODE_DIRECT_VIDEO_20260905.md`: 69 Web tests and real Chrome playback
coordination/desktop/mobile checks passed. Only Web development was deployed,
version `56e583da-63bd-43ca-bc38-3158313bf782`; production is unchanged.
The YouTube iframe uses `--radius-card` (14px), visually verified in Chrome.

## Latest Studio audio interaction (2026-09-05)

Studio's header includes **عرض الموقع**, opening a new tab without interrupting
editing/upload. The actual development/localhost Studio hostname always links to
`https://web.mukhtalif-development.workers.dev`. Production `studio.mukhtalif.net`
defaults to `https://staging.mukhtalif.net`; set build-time
`VITE_PRODUCTION_WEB_TARGET=live` only with the approved root-domain cutover to
link to `https://mukhtalif.net`. Do not infer environment from Vite PROD, which is
also true on public development. Unknown hosts do not render this shortcut.
Shortcut verification: 454 Studio tests, type-check/lint and guarded build pass;
Studio development version `a87f0496-c0b7-4d6e-be42-845efdfefa8a`. Desktop/mobile
browser-click acceptance is still pending because Chrome control timed out.
Source design re-check preserves the Studio font/palette, uses a plain labelled
link with a 44px target, keyboard outline, wrapping and no decorative animation,
and keeps the link visible outside the collapsed mobile menu. Production support
is implemented but not released to Hostinger.

The user explicitly requires **رفع الملف** to initiate audio upload independently
of Save. This supersedes older save-starts-upload notes. Metadata Save must never
upload a selected file. An initial upload creates a draft; existing-episode audio
upload must not persist unsaved metadata or change publication status.
Multipart progress/pause/resume/cancel is deployed on development only. Follow
`docs/STUDIO_AUDIO_UPLOAD_20260905.md` for architecture, tests, deployment receipts
and the still-open browser acceptance gate. There are 489 passing API and 445
Studio tests. Chrome blocked automatic file selection; do not claim the new
multipart browser test succeeded. Resume requires keeping the same page open.

## Active archive transfer and YouTube work (2026-09-04)

This section supersedes the old read-only weekend proposal in the audio tool's
documentation. The user approved transferring the **whole audio archive** from
their Mac to the existing private R2 bucket, and adding real YouTube episode
links, embeds and card thumbnails. This authorizes development implementation
and manual Cloudflare deployment, not a production database/Hostinger release.

- Work started from `dev` at `93e807f9d278`. All new migration, importer and UI
  work must stay on `dev`; do not merge `main` or deploy Hostinger automatically.
- Migration `0023_episode_youtube.sql` is applied on development
  `acomtixjibgkauzeltsn` only, with the full 845-row before-image outside Git.
  Keep production `pacpdxvujkjvnaeeuute` unchanged.
- The resumable local S3 multipart copy to `mukhtalif-audio` completed at
  September 5, 03:33 UTC: **841 verified and linked /841** across both batches.
  It verifies size and SHA-256 by reading every completed object back, then
  links only the verified key in development via compare-and-set. Source URLs
  remain intact. Never delete R2 objects or restart a second job over its lock.
- Follow `docs/AUDIO_R2_ACTIVE_RUN.md` for exact artifact/credential paths,
  resume commands, the token expiry (2026-09-11), checks and remaining work.
  Read the live checkpoint for counts; a background process is not proof that
  all files finished. The September 5 RSS audit found 5 additions and 1 removal:
  keep the removed episode, so the active union is **841** files. The additions
  are imported into development and run in a sequential two-batch queue.
  Read both checkpoints; the additions completed 5/5 and the original 836-file
  batch completed 836/836. Do not restart completed work or assume that this
  checkpoint milestone also proves the final provider/delivery/browser audits.
  Supervisor `79423` stopped at 394/841 on a valid mid-frame MP3 cut. The
  corrected bounded frame validator passed full-file decode evidence and 60
  archive tests; the same checkpoints resumed under supervisor `6292` with
  active log `transfer-resume-mp3-20260905.log`. Old logs/checkpoint before-image
  remain intact. Verify live process identity and the affected episode's final
  hash/link state instead of assuming recovery completed from startup alone.
  `mp3-sync-recovery-result.json` subsequently confirmed the original file hash,
  current R2 proof, development link/source preservation and both HTTP ranges.
  The resumed process passed the failure point; its 23:29 UTC count was 402/841.
  Include this mid-frame file in the final real-browser playback checks.
  Supervisor `6292` subsequently stopped at **813/841** on an upstream AAC
  file mislabeled MP3, `ep-rss-petroly-cb77233f92442c04`. The exact bytes passed
  full decode and ADTS-frame verification; a hash-pinned, source-specific format
  review now preserves those bytes/key/URLs while initially storing the correct
  `audio/aac` delivery type plus declared-source-type evidence. See the runbook.
  Recovery `30193` completed that file, then stopped at **816/841** on a second
  AAC source. A bounded prefix audit of the remaining files identified one more.
  Both additional sources passed independent full SHA-256, complete ADTS-frame
  walks and full `ffmpeg -xerror` decoding before their exact identities/hashes
  were added to `reviewed-audio-formats.ts`. There are exactly three reviewed
  exceptions, not generic AAC auto-acceptance. The same queue/checkpoints resumed
  under **`31453`**, log **`transfer-resume-aac-reviewed-20260905.log`**, and
  completed the whole scope. All three have full-readback/link checkpoint proof.
  Final audits must honor the reviewed MIME rather than infer it from `.mp3`.
  Real-browser playback subsequently passed for all three AAC cases and Joker;
  see `docs/AUDIO_R2_BROWSER_ACCEPTANCE_20260905.md`. No application deployment occurred for
  these local-tool changes; 68 archive and 470 API tests passed.
- `tools/audio-r2/src/audit.ts` is the read-only all-scope verification command;
  use the pinned queue checksum and exact count/bytes in the active runbook.
  It checks preserved development source identity and current R2 metadata/ETag
  against prior full-body readback proof. Exit 2 is expected while scope remains
  incomplete; inspect errors, not the exit code alone. The first full-scope
  snapshot preserved all 841 source identities and verified 334 completed
  object/key pairs with zero errors. This is not final transfer/UI acceptance.
  The **final** `scope-audit-20260905-complete841.json` now passes with
  `scopeComplete: true`: **841/841** current object proofs, development links,
  preserved source identities, and **zero failures**. The completed-copy receipt
  also confirms 841 before-images and no running transfer, lock or temp download.
  The final 16-feed RSS audit found no new/removed/changed sources relative to
  the latest snapshot; retain the one previously removed item (841 archived,
  840 currently in RSS). The separate **final** public range audit,
  `development-delivery-audit-20260905-full841.json`, also passed at 03:41:20 UTC:
  **841/841 files, 1682 HTTP 206 ranges matching direct private R2 bytes, zero
  failures**, including all reviewed AAC, M4A and mid-frame MP3 cases. These are
  complete transfer/provider/transport checks. The later browser acceptance
  report closes the playback/UI gates, with ten editorial cases explicitly
  deferred by the user. `archive-verification-handoff-20260905.json` pins the receipts
  and reconfirms 850 development rows, 831 unchanged reviewed YouTube links and
  the same 10 unresolved exceptions. No further copy/resume is needed.
- The live two-range API audit of 344 completed files caught five legacy M4A
  objects being labeled MP3 on delivery. Their bytes and original R2 metadata
  were correct. `safeAudioMediaContentType` now maps `audio/x-m4a` to `audio/mp4`
  on delivery only; strict upload types remain unchanged. The development-only
  repair passed full-response headers and first/last-byte comparisons for all
  five M4A files and two MP3 controls. Do not rewrite objects or source metadata
  to reproduce that repair. See the active runbook's before/after evidence.
  `development-delivery-audit-20260905-pass2.json` then checked 78 newly
  completed or previously MIME-failing files, with zero failures. Together with
  the earlier 339 passing files, 417 distinct archive files have first/last-byte
  API-to-R2 comparisons. This is partial transport coverage, not all-841 or
  browser acceptance. The 23:37 UTC checkpoint recorded 419 verified/linked;
  supervisor `6292` remained live. Read current checkpoints for newer counts.
  The later `checkpoint-progress-20260905-500plus.json` captured 506 verified
  and linked files (72.8 GiB) at September 5, 00:14 UTC, with the exact same
  supervisor confirmed live and both queue/plan hashes unchanged. This is a
  checkpoint milestone, not a new provider integrity audit or final acceptance.
  The newer `checkpoint-progress-20260905-750plus.json` records 754 verified
  and linked (124.66 GiB) at September 5, 02:30 UTC under the same live process.
  The all-scope audit was pending at that milestone; it subsequently passed as
  recorded above. Do not treat this historical count as an active transfer.
- YouTube matching is evidence-based; uncertain/unavailable videos stay empty.
  `docs/AUDIO_R2_REVIEW_QUEUE.md` is the Arabic action list for the ten remaining
  cases and live browser acceptance. Its candidate links are explicitly unapproved;
  do not import that document as confirmed matches or replace source audio.
  On September 5 the user explicitly deferred these ten editorial/source cases
  to a separate Notion task while asking to finish the technical work. All ten
  original audio files are already among the 841 verified R2 objects: do not
  recopy them or mistake deferral for approved video matches/replacements.
  Task `3d2ab5ab-63da-815c-b475-c2f4ec2a528b` (مراجعة الحلقات العشر بعد نقل الأرشيف إلى R2)
  is linked to the existing technical infrastructure project in Notion, with
  the review Markdown attached and the local file preserved. Its status is
  not started; these ten content decisions no longer block technical acceptance.
  Chrome access resumed during the user's latest turn. The old 03:49 UTC
  accessibility-window blocker is historical, not evidence of current state.
  Complete the actual browser checks before reporting technical acceptance;
  completed copy/network audits need no repeat just because work resumed.
  Do not guess links or use trailers as full episodes. Public premium episode
  projections suppress video IDs. Source metadata and row backups stay outside Git.
  Current development inventory: 850 episode rows, **831 unique YouTube links**,
  with 10 archive episodes unresolved. The current coverage audit found no
  missing archive rows, source-identity drift or invalid video sources across
  1,191 public metadata records. Six reviewed source channels are narrowly
  scoped in `youtube-channels.ts`; KFUPM is credited as the original producer
  of pre-2022 Petroly, not claimed to be Mukhtalif-owned. One importer-owned wrong link caused by
  a generic repeated description was corrected with a before-image and CAS;
  the matcher now rejects repeated excerpts and requires public official-channel
  metadata. See the private manual-review report before rerunning old reports.
  Historical reports may not reproduce after matcher updates; generate a new
  report from the preserved source snapshots rather than modifying an old report.
- `development-coverage-audit-pass3.json` is the current private YouTube audit.
  One renamed Petroly episode was linked after comparing actual speech in two
  separated 90-second windows with YouTube captions. The new content-review
  tool hash-pins this evidence and retains the exact-duration/date gates; it
  does not loosen automatic matching. ASR is supporting evidence, not a verdict.
  A separate `youtube-edition-reviewed.ts` path records actual different cuts:
  2–3 distant speech/caption comparisons, source hashes, guest and publisher,
  explicitly pinned dates/durations and an explanation. It does not infer matches
  or alter the automatic gates. Four same-recording editions were verified and
  linked, even though their published durations differ.
  `unresolved-reviewed-pass3.json` classifies the remaining 10: 3 public videos
  need video-side review (no captions), 3 have no verified public candidate, and
  4 have upstream audio issues. The Amazon source introduces a Filmrent cinema
  episode; Arwiqah problem-solving introduces Jassim Al-Mutawa's Petroly;
  Working Identity introduces Fit for Growth with Khalid Al-Ahmari; Manar's
  source is only the 44-second teaser. Independent raw-RSS checks confirm the
  same enclosures, not a parser/importer mixup. Preserve all four
  original URLs/files and keep their video links empty. Do not silently replace
  source audio, change its metadata, or download YouTube media to fill a gap.
  `public-embed-thumbnail-audit-20260905-pass1.json` checked all 831 current
  links against live YouTube oEmbed responses and actual card-thumbnail HEAD
  responses, with zero failures. It also rechecked the live development link
  inventory. This is metadata/delivery evidence, not a substitute for playback
  in the real browser or the ten unresolved editorial decisions.
- Existing local dotenv files can still hold old production credentials.
  Use the guarded Studio `build:development`/`deploy:development --env` scripts
  with the private development **anon** file. Never put service-role keys in
  browser configuration. API deploys retain the development auth/email guards.
- `docs/AUDIO_R2_BROWSER_ACCEPTANCE_20260905.md` records the later real Chrome
  acceptance: all three reviewed AAC files and Joker play, YouTube plays, both
  audio/video exclusion directions pass, and desktop/390px thumbnails, titles,
  keyboard focus and weekly horizontal scrolling were visually verified.
  Authenticated Studio YouTube save/clear passed on a new development test draft
  `ep-12005d29`, with direct database reads confirming stored ID then null.
  The draft stays unpublished and its public endpoint returns 404. At 08:16 UTC
  there are 851 development rows; all 841 archive source identities/R2 keys and
  831 reviewed video IDs remain unchanged. The ten deferred cases stay empty.
  Separate live audio-upload verification is still pending: the Chromium file
  chooser rejects `setFiles` with `Not allowed`; the owner must select the file
  or enable the extension's `Allow access to file URLs`. Do not change that
  permission without approval. The form is not saved and no new audio was
  uploaded by this test. Existing upload is one request, not browser multipart
  resume; the displayed 500 MiB maximum has not passed a large-file live test.
  Five additional local Studio interaction tests cover YouTube save/clear,
  validation, failed-save retry and read-only permissions (430 Studio tests now
  pass). The later live save/clear result above is independent of those tests.
- `local-regression-verification-20260905.json` records the fresh 02:45-02:47
  UTC local pass: 469 API, 430 Studio, 67 Web, 66 archive/RSS, and 5 deployment
  tests (1037 total); 22 uncached workspace type/lint tasks; separate tool
  type/lint checks; and a Node.js 22-target bundle build. Tests ran under local
  Node 26.3.0, not a Node 22 runtime. No deployment occurred. The private receipt
  includes a post-test 542-file source manifest. This snapshot predates the AAC
  tool changes and added API regression above; browser acceptance remains open.
- The newer `local-regression-verification-20260905-final.json` supersedes that
  local-test snapshot: **1046 passing tests** (470 API, 430 Studio, 67 Web,
  74 archive/RSS, 5 deployment), all type/lint/bundle checks pass, and identical
  before/after manifests of 544 source/config files. Tests used Node 26.3.0;
  the bundle targets Node 22. No new application deployment occurred.
- Latest manual development deploys: API `8e89fcc2-a271-4bfc-833a-71486e520c14`,
  Studio `a87f0496-c0b7-4d6e-be42-845efdfefa8a`,
  Web `56e583da-63bd-43ca-bc38-3158313bf782`. Source remains uncommitted on `dev`
  at `93e807f9d278`; no commit, push or production merge is implied by deployment.

## Current release authorization

On 2026-09-02 the user explicitly authorized this acceptance release after the
source is merged through `dev` into `main`. The authorization is limited to:

- production API at `https://api.mukhtalif.net`;
- production Studio at `https://studio.mukhtalif.net`;
- acceptance Web at `https://staging.mukhtalif.net` with global `noindex`.

The root `https://mukhtalif.net` and the previous production systems must remain
unchanged and recoverable. Authorization does not waive any release gate below:
use one verified `main` SHA, keep deployment manual, pin the approved Supabase
project, pass schema/data/Auth verification, and
smoke-test API before Studio and Web. Stop instead of substituting development
credentials or enabling automatic deployment.

## Current working state and Saturday handoff

Status saved on 2026-09-03. Resume this work on Saturday, 2026-09-05, from
this section instead of reconstructing state from browser history or local env
files.

- The active integration branch is `dev` at `9ce7df3140b5`. `origin/dev` and
  `abu3la/dev` point to the same commit. `origin/main` and `abu3la/main` remain
  at `9eb60da7f7dd`; `dev` is ahead with the current development work. Do not
  merge or deploy those commits to production without a new explicit release
  instruction.
- Cloudflare is the isolated development runtime. The deployed API, Studio,
  and Web origins are the three `*.mukhtalif-development.workers.dev` origins
  listed below. Development API and Studio use Supabase project
  `acomtixjibgkauzeltsn`, never the production project.
- The development Studio account `aaahashmi95@gmail.com` is active. Studio's
  account-security page now sends a Supabase reauthentication code before it
  reveals the password fields and submits that code as the password-change
  nonce. It accepts configured email OTP lengths from 6 through 10 digits and
  normalizes Arabic and Persian numerals. The deployed Studio version is
  `ea27aa35-a684-459a-8b46-1732f7473e24`.
- Supabase `Mukhtalif-Dev` has **Secure password change** enabled and currently
  has an email OTP length of 8 digits. No password or OTP is stored in this
  repository. A browser operator must always perform the final password-change
  submission personally.
- Hostinger is the production runtime. `https://api.mukhtalif.net/health/live`,
  `https://studio.mukhtalif.net/`, and the acceptance Web at
  `https://staging.mukhtalif.net/` return HTTP 200. Staging intentionally tests
  the production API, production Supabase project, and shared R2 before the
  root Web cutover. `https://mukhtalif.net` remains outside the current cutover.
- The production Supabase project is `pacpdxvujkjvnaeeuute`. Do not run a
  development migration, importer, smoke write, or Studio build against it.
  New schema work is written as a versioned migration, proved on
  `acomtixjibgkauzeltsn`, reviewed, backed up, and only then applied manually to
  production as part of an approved release.
- Mailchimp subscriber sync and campaign sending remain paused. Keep
  `NEWSLETTER_MAILCHIMP_SYNC_ENABLED=false` and
  `MAILCHIMP_CAMPAIGNS_ENABLED=false` until the account subscription is renewed
  and a separate enablement is approved.

Saturday resume checklist:

1. Let the user test the complete Studio password flow: request the email code,
   enter the received 8-digit code and a new password, and personally submit the
   final change. Never read, type, store, or submit the password or OTP for them.
2. Create one uniquely named, no-index, newsletter-disabled draft article
   through the Cloudflare development Studio. Prove it exists in development
   only and that the production database fingerprint and matching slug remain
   unchanged.
3. Verify the Cloudflare API and Studio still resolve to
   `acomtixjibgkauzeltsn`; verify staging and Hostinger still resolve to the
   production API and `pacpdxvujkjvnaeeuute` before any write.
4. Run the full repository verification workflow. Review every commit in
   `origin/main..origin/dev`, then merge `dev` to `main` only after explicit
   approval. A merge remains verification eligibility, not deployment
   authorization.
5. Keep all deploys manual. Do not enable automatic GitHub deployment, do not
   change DNS, and do not cut over `mukhtalif.net` until the user explicitly
   authorizes the final production Web release.

## GitHub source with manual deployment

This monorepo is the only application source. Do not maintain a Hostinger copy,
upload a ZIP as the normal release method, edit generated files on a server, or
fork business logic by hosting provider.

- `dev` is the Cloudflare development integration branch.
- `main` is the protected production source branch. Hostinger Web, Studio, and
  API applications pull only from this branch through Hostinger's GitHub
  integration.
- A reviewed `dev` -> `main` merge makes that exact commit eligible for a
  production release; it does **not** deploy it. Do not push directly to `main`
  or enable a Hostinger integration against `dev`.
- All Cloudflare and Hostinger deployments are manual. A push, merge, tag, or
  successful GitHub Actions run must never deploy by itself. GitHub Actions is
  verification-only unless the user explicitly changes this policy later.
- Keep Hostinger automatic deployment disabled. A production operator must
  record the approved `main` commit SHA, confirm the verification workflow passed
  for that SHA, confirm `origin/main` still points to it, and then start each
  deployment manually from hPanel. If the selected Hostinger integration cannot
  guarantee manual-only deployment, do not activate it.
- Pull requests must test the Cloudflare and Hostinger build targets before
  merge. Provider-specific entry points and adapters are allowed; duplicated
  routes, schemas, UI source, or business rules are not.
- Secrets remain in each provider's environment store. GitHub contains variable
  names, validation, and examples only, never live values.
- Generated `dist`, `.open-next`, and other build artifacts are reproducible
  outputs and are not the source of truth.

## Non-negotiable environment split

Development runs entirely on Cloudflare. Production runs on Hostinger. The only
Cloudflare production dependency is private R2 object storage.

| Concern               | Development                                                          | Production                                                                                          |
| --------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Public web            | Cloudflare Worker: `web.mukhtalif-development.workers.dev`           | Hostinger acceptance: `https://staging.mukhtalif.net`; final cutover later: `https://mukhtalif.net` |
| Studio                | Cloudflare Worker: `studio.mukhtalif-development.workers.dev`        | Hostinger: `https://studio.mukhtalif.net`                                                           |
| API                   | Cloudflare Worker: `mukhtalif-api.mukhtalif-development.workers.dev` | Hostinger Node.js: `https://api.mukhtalif.net`                                                      |
| Database and Auth     | Supabase project `acomtixjibgkauzeltsn`                              | Supabase project `pacpdxvujkjvnaeeuute`                                                             |
| Audio and media bytes | Private Cloudflare R2 buckets                                        | The same R2 service, accessed from Hostinger through its S3-compatible API                          |
| Form email            | Resend development key/domain                                        | Separate Resend production key/domain                                                               |
| DNS authority         | Hostinger DNS for `mukhtalif.net`                                    | Hostinger DNS for `mukhtalif.net`                                                                   |

Cloudflare Workers are not a production fallback. Never point `mukhtalif.net`,
`studio.mukhtalif.net`, or `api.mukhtalif.net` to a `workers.dev` deployment.
Never persist a `workers.dev` URL in production article media, canonical URLs,
email templates, redirects, or database rows.

The earlier temporary shared-database decision was superseded on 2026-09-03.
Cloudflare development must pin `acomtixjibgkauzeltsn`; Hostinger API and Studio
must pin `PRODUCTION_SUPABASE_PROJECT_REF=pacpdxvujkjvnaeeuute` and use that
project's matching server/browser credentials. Never copy live keys into Git or
between the two environments. Staging Web is an acceptance surface over the
production API and production data by design; it is not the Cloudflare
development database.

During the acceptance phase, Web uses `https://staging.mukhtalif.net` as its
canonical origin and must emit both HTML robots metadata and an `X-Robots-Tag`
header denying indexing. API and Studio remain production-grade. Do not point or
redirect `mukhtalif.net` to the new Web until a separate final-cutover approval.

The Cloudflare development account and Worker names are defined in the three
`wrangler.jsonc` files. Do not change their `account_id`, namespace, or bindings
without explicit approval. Use R2 buckets `mukhtalif-audio` and
`mukhtalif-media`; do not create environment-specific copies unless a migration
plan requires them.

## Runtime architecture

Keep Hono. Production is not a rewrite of the API:

- Cloudflare development continues to use `apps/api/src/index.ts` and native R2
  bindings.
- Hostinger production uses Node.js 22 and a Node entry point for the same Hono
  app.
- Put runtime-specific storage behind adapters. The Node adapter must access R2
  with an S3-compatible client and must preserve the existing repository and
  media contracts.
- Read Hostinger production configuration from environment variables. Never
  upload an env file containing secrets.
- Replace Worker-only scheduled/background primitives with an explicit Node or
  Hostinger job adapter before enabling the affected feature.
- Both runtimes must pass the same API contract, auth, CORS, media, forms, and
  publishing tests.

Supabase is independent of the hosting runtime. The Studio browser and the API
must always target the same Supabase project during a cutover. Changing only
one side creates split-brain authentication and 401 responses. Migrate Auth
UUIDs with public data, or use a reviewed UUID mapping; never reconnect users
by email at runtime.

## Environment and secret policy

Development Cloudflare Worker policy:

```text
APP_ENV=production
DEPLOYMENT_PLATFORM=cloudflare-workers
ALLOW_DEV_AUTH=false
RESEND_ENVIRONMENT=development
FORMS_FROM_EMAIL=forms@devmail.mukhtalif.net
all six form types -> aaahashmi95@gmail.com
```

The remote development Worker deliberately uses `APP_ENV=production` so auth,
rate limits, and media fail closed on a public URL. Local `wrangler dev` may use
`APP_ENV=development`; never enable the dev identity bypass remotely.

Production Hostinger policy:

```text
APP_ENV=production
DEPLOYMENT_PLATFORM=hostinger
ALLOW_DEV_AUTH=false
PRODUCTION_SUPABASE_PROJECT_REF=pacpdxvujkjvnaeeuute
RESEND_ENVIRONMENT=production
FORMS_FROM_EMAIL=forms@notify.mukhtalif.net
MEDIA_PUBLIC_ORIGIN=https://api.mukhtalif.net
```

Pin that ref independently in the API and Studio environments. The production
guards require the exact matching `*.supabase.co` origin, reject spoofed or
path-bearing origins, reject a public key in the API service-role slot, and
reject a secret/service-role key in Studio's browser bundle. Do not weaken this
gate to make a build pass.

Production form routing is locked:

- `sponsorship`, `partnership`, `production_service` -> `bd@mukhtalif.net`
- `guest_suggestion`, `guest_review` -> `pr@mukhtalif.net`
- `careers` -> `hr@mukhtalif.net`

Use a separate sending-only Resend key restricted to each sender domain:

- development: `devmail.mukhtalif.net`; key exists only in Cloudflare secrets
- production: `notify.mukhtalif.net`; key exists only in Hostinger secrets

Never copy a key between environments. Supabase Auth email is a third, separate
SMTP credential and sender domain (for example `auth.mukhtalif.net`); do not
reuse either forms key. Development Auth invitations may be tested only with
the owned address `aaahashmi95@gmail.com`.

Use these references instead of duplicating policy:

- `docs/RESEND_ENVIRONMENTS.md`
- `apps/api/.env.production.hostinger.example`
- `scripts/email-environment-policy.mjs`
- `scripts/assert-cloudflare-development.mjs`
- `scripts/assert-hostinger-production-env.mjs`

## Data and media rules

- Supabase stores application data and Auth. Supabase Storage is not the media
  source for this project.
- R2 stores private audio and article-media bytes. Production serves approved
  media through `https://api.mukhtalif.net/media/:id` (or a later explicitly
  approved production media hostname), not through a Worker URL.
- A form submission is saved to Supabase before Resend is called. Email failure
  must not lose the request; Studio owns retry and audit state.
- Do not claim WordPress migration is complete until database apply, URL/media
  resolution, redirect validation, and row-count verification all pass.
- Do not run a production article import until the Hostinger API can serve every
  referenced R2 object through the production media origin. Import plans must
  reject localhost, private addresses, `workers.dev`, and `pages.dev` origins.
- Keep WordPress and the previous Supabase/Cloudflare deployments recoverable
  until production smoke tests, counts, Auth, redirects, and rollback checks are
  complete. Never delete them merely because a backup file exists.

## Approved manual release path

1. Back up the current Supabase database/Auth and generate count/checksum
   manifests. Preserve backups outside Git with restricted permissions.
2. Finish and test the Hostinger Node entry point plus the R2 S3 adapter. Keep
   all business routes shared with the Worker build.
3. Verify the explicitly approved, shared Supabase project: confirm migrations
   `0001` through `0022`, run `apps/api/supabase/verify_deployment.sql`, take a
   current backup, and prove the initial administrator login. Do not rerun
   importers or create a second project for this acceptance release.
4. Create the Hostinger API app, connect it only to `main`, disable automatic
   deployment, enter production secrets in hPanel, and make
   `pnpm --filter @mukhtalif/api verify:hostinger-production` a mandatory
   pre-build/pre-start gate.
5. Select an exact verified `main` commit, freeze further merges for the release
   window, obtain an explicit **"publish now" / "انشر الآن"** instruction, and
   start the API deployment manually from hPanel. Never treat a merge as approval
   to deploy.
6. Verify the API at `api.mukhtalif.net`: health, unauthenticated 401s,
   authenticated Studio access, CORS, forms persistence, and R2 media reads.
7. Import verified content only after step 6. Compare row counts, media hashes,
   article rendering, audio playback, authors, covers, inline linked images,
   and redirects.
8. Manually deploy Studio and Web from the same approved `main` commit, after the
   API smoke tests pass. Use the production API and the same pinned Supabase
   project. Deploy Studio as a static Vite frontend so its validated Hostinger
   `.htaccess` SPA fallback remains active; prove `/login`, `/invite`, and
   `/articles/new` as direct URLs. Configure
   `https://studio.mukhtalif.net/invite` in Supabase Auth redirects.
9. Verify Resend with one controlled request for each form type, then confirm
   the real production routing. Verify Supabase Auth email separately.
10. Point the public DNS records to Hostinger only after end-to-end staging and
    rollback checks pass. Monitor errors and keep the old systems recoverable
    during the agreed rollback window.

For Cloudflare development deploys, use the guarded package scripts. Do not call
raw `wrangler deploy` in a way that bypasses `verify:cloudflare-development`.
For Hostinger production, never build with Cloudflare development URLs or
secrets present in the environment. These package scripts are run manually;
GitHub verification never invokes a live provider deployment.

## Current launch blockers (update as work lands)

Status recorded 2026-09-03:

- Resend DNS records for `devmail.mukhtalif.net` and `notify.mukhtalif.net` are
  present in Hostinger DNS and both domains are verified in Resend. Restricted,
  environment-specific API key creation still requires completion.
- Hostinger API, Studio, and acceptance Web are deployed and return HTTP 200 on
  their expected public origins. Production R2 media reads, authenticated
  Studio actions, form routing, redirects, and rollback behavior still need one
  recorded end-to-end acceptance pass before the root Web cutover.
- Production remains on Supabase `pacpdxvujkjvnaeeuute`. Development now uses
  the separate project `acomtixjibgkauzeltsn`; the old shared-database warning
  is no longer current. Verify both refs immediately before every migration,
  importer, build, or smoke write.
- The production project contains migrations `0001` through `0022` and the
  imported content. The read-only pre-release snapshot at
  `2026-09-02T21:11:39.842516Z` passed `pg_restore --list`, all 22 ledger checks,
  and 23 deployment checks with no failures. Take a new verified backup before
  applying any migration created after `0022`.
- Development password reauthentication is implemented, deployed, and enabled
  in Supabase. The remaining check is a user-performed live password change with
  the emailed OTP; agents must not perform the final submission.
- The reviewed WordPress plan is applied to the canonical development Supabase
  source that became production project `pacpdxvujkjvnaeeuute`: 56 articles,
  238 ready media rows, 17 people, 56 bylines, 5 books, 378 source records, and
  82 redirects. The post-apply
  database dry run reports zero mutations and all media references resolve.
  No second content import is required. The authorized Hostinger subdomain
  acceptance release is live; the root-domain cutover remains out of scope.

Any agent completing one of these items must update this section and the linked
runbook in the same change.
