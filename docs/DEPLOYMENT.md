# Deployment Runbook

> **Environment ownership (2026-09-02):** Cloudflare Workers hosts development
> deployments and Cloudflare R2 stores media. The production API and web app are
> Hostinger Node.js deployments. Any older example below that points a
> production hostname at a Worker is superseded by this rule. Form email must
> follow `RESEND_ENVIRONMENTS.md`; production must never use a `workers.dev`
> media origin.

Order matters. Each stage assumes the previous one is verified.

Mailchimp is intentionally not covered here — see `MAILCHIMP_PUBLISHING.md`. It
is independent of everything below and can be configured later; the API treats a
wholly absent Mailchimp configuration as "disabled", not as an error.

Development migrations and imports have been exercised on the canonical
development project. The Hostinger production sequence has not been executed.

---

## 0. Before you start

| You need                                 | Why                                                 |
| ---------------------------------------- | --------------------------------------------------- |
| A dedicated production Supabase project  | Production application data and Auth                |
| A Cloudflare account with Workers and R2 | Development deployments and object storage          |
| Hostinger Node.js application hosting    | Production API and public site                      |
| `wrangler` authenticated                 | `pnpm --filter @mukhtalif/api exec wrangler whoami` |

There is no Supabase CLI project in this repo — `apps/api/supabase/` holds
migrations only. Apply them through the Supabase SQL editor or `psql`.

**Never place the service-role key in browser-visible configuration, a commit,
or a screenshot.** Development stores it as a Cloudflare secret; production
stores it only in Hostinger's environment secret store.

---

## 1. Database migrations

Do not assume any migration is already applied to a new production project. The
current release contains migrations `0001` through `0022`; the production
ledger must contain every one before the API is started.

### 1.1 Apply, in this order

Use the guarded migration runner with a connection string for the dedicated
production target, then confirm the ledger lists `0001` through `0022` exactly:

```bash
./scripts/migrate.sh
```

`0015` runs inside an explicit transaction and rewrites
`provision_invited_studio_member`, so a newly invited member starts pending. If
it fails partway it rolls back whole; re-run it after fixing the cause.

Do not drop partially-created production objects manually. Stop, restore the
verified pre-migration backup or reconcile the exact failed migration, and then
rerun the guarded sequence.

### 1.2 Verify

```bash
psql "$SUPABASE_DB_URL" -f apps/api/supabase/verify_deployment.sql
```

Every `status` column must read `ok`. The script is read-only and re-runnable.

All sections must report `ok`, including access, invitations, content, media,
forms, newsletter storage, and homepage settings. Mailchimp remains disabled
until its subscription is renewed.

---

## 2. Supabase Auth — invitation acceptance

The invited person clicks the emailed link, lands on the Studio, and sets a
password. Two settings make that work.

### 2.1 Point the Worker at the acceptance page

The Studio acceptance route is `/invite`. Set:

```
STUDIO_INVITE_REDIRECT_URL = https://studio.mukhtalif.net/invite
```

The API validates this value: it must be absolute, HTTPS outside development,
and carry no credentials or fragment. A bad value fails the invitation with
`AUTH_PROVISIONING_UNAVAILABLE` rather than sending a broken link.

### 2.2 Allowlist the same URL in Supabase

Supabase Dashboard → **Authentication → URL Configuration → Redirect URLs**, add
the exact same URL. Supabase silently drops a redirect that is not allowlisted,
so the invitee lands on the site root with no session and acceptance appears to
"do nothing".

### 2.3 Confirm SMTP

Authentication → Emails. On the default Supabase SMTP the invite quota is very
low and unsuitable for production; configure a real provider before inviting
real operators.

### 2.4 Check the flow end to end on staging

On the Cloudflare development deployment, invite only
`aaahashmi95@gmail.com`. Supabase Auth SMTP is separate from form notifications
and cannot be redirected by the Resend form routing table. Then confirm:

1. `GET /studio/invitations/me` reports `status: "invited"`.
2. The email arrives and its link lands on the allowlisted URL with a session.
3. `POST /studio/invitations/accept` with a password of at least 12 characters
   returns `accepted`.
4. Repeating the accept returns **409 `ALREADY_ACCEPTED`**. Acceptance is
   one-time by design, so a replay cannot reopen password setup on a live
   account.

---

## 3. Cloudflare R2 and the development API Worker

### 3.1 Create the buckets

```bash
pnpm --filter @mukhtalif/api exec wrangler r2 bucket create mukhtalif-audio
```

```bash
pnpm --filter @mukhtalif/api exec wrangler r2 bucket create mukhtalif-media
```

Keep both **private**. `mukhtalif-media` must not be given a public r2.dev URL.
The development Worker serves its `/media/:id` route; the production Hostinger
API will use the R2 S3-compatible API and serve the equivalent production route.
A public bucket URL bypasses sanitisation, immutability, and `nosniff` and cannot
be withdrawn from an already-sent email.

### 3.2 Bind them

Edit `apps/api/wrangler.jsonc` and add, alongside `observability`:

```jsonc
"r2_buckets": [
  { "binding": "AUDIO", "bucket_name": "mukhtalif-audio" },
  { "binding": "MEDIA", "bucket_name": "mukhtalif-media" }
],
```

The development bindings are committed in `apps/api/wrangler.jsonc`. Hostinger
does not receive a Worker binding; its production Node storage adapter uses
separate R2 S3 credentials stored only in Hostinger's secrets panel.

### 3.3 Set the Worker variables

`MEDIA_PUBLIC_ORIGIN` is the API's own HTTPS origin, because the Worker serves
`/media/:id` itself. **Outside development the API refuses to start when `MEDIA`
is bound and this is unset**, which is deliberate: it would otherwise mint image
URLs against whatever origin a request happened to arrive on.

The committed `apps/api/wrangler.jsonc` values are:

```jsonc
"APP_ENV": "production",
"DEPLOYMENT_PLATFORM": "cloudflare-workers",
"ALLOW_DEV_AUTH": "false",
"CORS_ALLOWED_ORIGINS": "https://studio.mukhtalif-development.workers.dev,https://web.mukhtalif-development.workers.dev",
"MEDIA_PUBLIC_ORIGIN": "https://mukhtalif-api.mukhtalif-development.workers.dev",
"RESEND_ENVIRONMENT": "development",
"FORMS_FROM_EMAIL": "forms@devmail.mukhtalif.net",
```

`CORS_ALLOWED_ORIGINS` lists the development Studio and public Web origins. The
public forms submit from the browser, so Web needs CORS even though catalogue
reads happen server-side. A wildcard is rejected outright.

`ALLOW_DEV_AUTH` must be `false`. The `x-dev-user` header bypasses Supabase
entirely; it is gated on `APP_ENV=development` _and_ this flag, and both must
fail closed on every public deployment.

### 3.4 Set the secrets

```bash
pnpm --filter @mukhtalif/api exec wrangler secret put SUPABASE_URL
```

```bash
pnpm --filter @mukhtalif/api exec wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

```bash
pnpm --filter @mukhtalif/api exec wrangler secret put STUDIO_INVITE_REDIRECT_URL
```

The API treats the two Supabase values as a pair: configuring one without the
other is a configuration error, not a silent fallback to the in-memory
repository.

Store only the restricted development Resend key on Cloudflare. Follow
`RESEND_ENVIRONMENTS.md`; the production key belongs only in Hostinger.

### 3.5 Deploy and smoke test

```bash
pnpm --filter @mukhtalif/api deploy
```

```bash
curl -s https://mukhtalif-api.mukhtalif-development.workers.dev/home | head -c 400
```

Then confirm the boundary actually holds:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://mukhtalif-api.mukhtalif-development.workers.dev/studio/summary
```

This must be **401**. If it returns data, `ALLOW_DEV_AUTH` is still on.

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "x-dev-user: usr-admin-1" https://mukhtalif-api.mukhtalif-development.workers.dev/studio/guests
```

This must also be **401**, not 200. The dev header must be inert in production.

### 3.6 Audio and media checks

Upload one episode audio file through the Studio, then:

- `GET /episodes/:id/audio` returns `content-type: audio/*` and
  `x-content-type-options: nosniff`.
- A `Range` request returns 206 with the same headers.
- Uploading a `text/html` body returns **415**. The allowlist is what stops
  active content being parked on the API origin.

Then follow the existing image checklist in `MEDIA_PUBLISHING.md` §Production
Checklist — in particular, confirm a pending or malformed upload returns 404
from `/media/:id`.

---

## 4. _(Mailchimp — deliberately skipped, see `MAILCHIMP_PUBLISHING.md`)_

---

## 5. The public site

### 5.1 The one value that must agree

`PUBLIC_WEB_URL` must name the **same origin** on the site and on the API
Worker. The API builds absolute article links into newsletter HTML from its own
copy, and **a sent email cannot be rewritten**. If they disagree, mail already
in inboxes points at pages this site does not serve.

Set it on the API too when newsletters are enabled:

```
PUBLIC_WEB_URL = https://mukhtalif.net
```

### 5.2 Build and preview locally against the real API

```bash
pnpm --filter @mukhtalif/web preview
```

This runs the Cloudflare build and serves the actual Worker bundle in
`workerd`, not `next dev`. Check the Arabic RTL rendering and one article page
before deploying — this is the last step where a mistake is free.

### 5.3 Deploy development

```bash
pnpm --filter @mukhtalif/web exec wrangler deploy --var MUKHTALIF_API_URL:https://mukhtalif-api.mukhtalif-development.workers.dev --var PUBLIC_WEB_URL:https://web.mukhtalif-development.workers.dev
```

`apps/web/wrangler.jsonc` ships with an empty `vars` block on purpose, so a
staging deploy cannot silently inherit a production API origin.

To build and deploy in one step instead:

```bash
pnpm --filter @mukhtalif/web deploy
```

Note that form takes its variables from `wrangler.jsonc`, so set them there
first if you use it. This command is development-only.

### 5.4 Deploy production on Hostinger

Create separate Hostinger Node.js applications for the production API and Web
app. During acceptance their environment must use `https://api.mukhtalif.net`
and `https://staging.mukhtalif.net`; do not copy either development Worker
origin. The Web deployment must return `X-Robots-Tag: noindex, nofollow,
noarchive` and matching HTML robots metadata. The API application uses the same
Hono routes as the development Worker through a small Node adapter. Configure
the API application as follows:

Production deployment is manual. Connect each Hostinger application only to the
repository's `main` branch and disable automatic deployment. A merge to `main`
creates a release candidate but must not trigger a deployment. GitHub Actions
only verifies the source.

For every release:

1. Record the approved `origin/main` commit SHA and confirm all verification jobs
   passed for that exact SHA.
2. Freeze additional merges to `main` until the release and smoke tests finish.
3. Obtain a new explicit **"publish now" / "انشر الآن"** instruction.
4. In hPanel, manually redeploy the API and verify it before manually redeploying
   Studio and Web from the same commit.
5. Record the deployed SHA and smoke-test results in the release record.

If Hostinger cannot guarantee manual-only behavior for the selected integration,
do not activate it. Never accept automatic deployment as a fallback.

```text
Build command: pnpm --filter @mukhtalif/api build:hostinger
Start command: pnpm --filter @mukhtalif/api start:hostinger
Generated entry: apps/api/dist/node.cjs
Liveness path: /health/live
```

Configure the other two applications from the same `main` SHA:

```text
Studio build: pnpm --filter @mukhtalif/admin build:hostinger
Studio output: apps/admin/dist
Web build: pnpm --filter @mukhtalif/web build:hostinger
Web start: pnpm --filter @mukhtalif/web start:hostinger
```

Deploy Studio as a static React/Vite frontend, not as a Node proxy app. Its
Hostinger build copies a validated `.htaccess` into `apps/admin/dist` so direct
requests such as `/login`, `/invite`, and `/articles/new` resolve internally to
`index.html` while real assets remain untouched. Confirm those three deep links
on the Hostinger preview before assigning `studio.mukhtalif.net`.

The Studio and Web build guards reject development Supabase/Worker origins and
reject any Web canonical origin other than `https://staging.mukhtalif.net`
during this acceptance release.

Set `PRODUCTION_SUPABASE_PROJECT_REF` to the exact 20-character production
project ref in both the API and Studio applications. The guards require the
matching standard Supabase HTTPS origin. Studio accepts only an anon or
publishable browser key; the API accepts only a secret or legacy service-role
key. Never paste the service-role key into a `VITE_*` variable.

Both build and start run
`pnpm --filter @mukhtalif/api verify:hostinger-production`. Enter every variable
listed in `apps/api/.env.production.hostinger.example` in Hostinger's secrets
panel. The five `R2_*` variables are all-or-nothing; the credentials must be
bucket-scoped Object Read & Write keys. Set `TRUST_PROXY_HOPS` only after
confirming Hostinger's reverse-proxy chain. A value that is too high trusts a
client-supplied forwarding address; a value that is too low groups requests by
the proxy address.

Local build and runtime smoke tests are complete. The 2026-09-02 acceptance
release is authorized, but a Hostinger preview still must pass against real R2
credentials before changing DNS: `/health/live` must return 200, an
unauthenticated Studio route must return 401, allowed CORS preflights must
succeed, media HEAD/full/range reads must match stored sizes and ETags, and one
disposable upload/delete cycle must pass in each bucket.

### 5.5 Verify

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://staging.mukhtalif.net/articles/<a-published-slug>
```

Then confirm, on the deployed site:

- An unpublished slug renders the Arabic 404, not an error page.
- The article canonical tag matches `PUBLIC_WEB_URL` exactly.
- Every staging response includes `X-Robots-Tag: noindex, nofollow, noarchive`.
- **View source and search for `MUKHTALIF_API_URL`, `supabase`, and `eyJ`.** All
  three must be absent: every read is server-side and no credential or API
  origin should reach the browser.

### 5.6 A note on build-time API availability

Reads carry `revalidate: 60`. When the API is reachable at build time the home
and programmes pages prerender and refresh on that interval. When it is not, the
data layer calls `connection()` before failing, which makes those routes render
per request instead. **A build run against a down API therefore cannot bake an
error page into static output** — it degrades to dynamic rendering. Both
directions have been verified locally.

---

## 6. Known remaining work

- **The Studio's invitation-acceptance screen does not exist yet.** The API
  contract (`/studio/invitations/me`, `/studio/invitations/accept`) is complete
  and tested, but until that page is built an invitee has nowhere to land. Do
  not send production invitations before it ships.
- **No analytics service.** `readAnalytics` in the Studio deliberately still
  reports unsupported rather than deriving figures the server never produced.
- **No R2 orphan-object reconciliation job.** See `MEDIA_PUBLISHING.md` for the
  retention constraints any such job must respect.
- **`apps/web` has no incremental cache binding.** It relies on
  `revalidate: 60` alone. Add an R2 or KV cache only once real traffic justifies
  it.
