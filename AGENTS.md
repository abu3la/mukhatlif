# Mukhtalif deployment architecture

This file is the operational source of truth for every agent working in this
repository. Read it before changing deployment, environment, DNS, email,
storage, authentication, or content-import code. When implementation and this
file disagree, stop and reconcile the difference instead of guessing.

## Current release authorization

On 2026-09-02 the user explicitly authorized this acceptance release after the
source is merged through `dev` into `main`. The authorization is limited to:

- production API at `https://api.mukhtalif.net`;
- production Studio at `https://studio.mukhtalif.net`;
- acceptance Web at `https://staging.mukhtalif.net` with global `noindex`.

The root `https://mukhtalif.net` and the previous production systems must remain
unchanged and recoverable. Authorization does not waive any release gate below:
use one verified `main` SHA, keep deployment manual, prepare an independent
production Supabase project, pass migrations and data/Auth verification, and
smoke-test API before Studio and Web. Stop instead of substituting development
credentials or enabling automatic deployment.

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
| Database and Auth     | Development Supabase project                                         | Explicitly selected production Supabase project                                                     |
| Audio and media bytes | Private Cloudflare R2 buckets                                        | The same R2 service, accessed from Hostinger through its S3-compatible API                          |
| Form email            | Resend development key/domain                                        | Separate Resend production key/domain                                                               |
| DNS authority         | Hostinger DNS for `mukhtalif.net`                                    | Hostinger DNS for `mukhtalif.net`                                                                   |

Cloudflare Workers are not a production fallback. Never point `mukhtalif.net`,
`studio.mukhtalif.net`, or `api.mukhtalif.net` to a `workers.dev` deployment.
Never persist a `workers.dev` URL in production article media, canonical URLs,
email templates, redirects, or database rows.

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
- Hostinger production uses a Node.js entry point for the same Hono app.
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
RESEND_ENVIRONMENT=production
FORMS_FROM_EMAIL=forms@notify.mukhtalif.net
MEDIA_PUBLIC_ORIGIN=https://api.mukhtalif.net
```

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
3. Prepare the production Supabase project: apply reviewed migrations in order,
   restore/import data and Auth, run `apps/api/supabase/verify_deployment.sql`,
   and prove the initial administrator login.
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
   API smoke tests pass. Use the production API and the same production Supabase
   project. Configure
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

Status recorded 2026-09-02:

- Resend DNS records for `devmail.mukhtalif.net` and `notify.mukhtalif.net` are
  present in Hostinger DNS and both domains are verified in Resend. Restricted,
  environment-specific API key creation still requires completion.
- The Hostinger Node entry point and R2 S3 adapter are implemented and pass the
  local API contract, build, startup, health, CORS, auth-boundary, and shutdown
  checks. Live R2 credential/read/write verification on a Hostinger preview
  remains required before the authorized release can complete.
- Hostinger Web, Studio, and API production applications are not deployed yet.
- The production Supabase target/cutover has not completed.
- The reviewed WordPress plan is applied to the canonical development Supabase
  project `pacpdxvujkjvnaeeuute`: 56 articles, 238 ready media rows, 17 people,
  56 bylines, 5 books, 378 source records, and 82 redirects. The post-apply
  database dry run reports zero mutations and all media references resolve.
  Production content import and the authorized Hostinger subdomain cutover are
  incomplete. The root-domain cutover remains out of scope.

Any agent completing one of these items must update this section and the linked
runbook in the same change.
