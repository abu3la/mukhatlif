# Deployment Runbook

Order matters. Each stage assumes the previous one is verified.

Mailchimp is intentionally not covered here — see `MAILCHIMP_PUBLISHING.md`. It
is independent of everything below and can be configured later; the API treats a
wholly absent Mailchimp configuration as "disabled", not as an error.

Nothing in this runbook has been executed. It has been written against the code
as it stands and the commands have been checked for shape, not run against a
live account.

---

## 0. Before you start

| You need | Why |
| --- | --- |
| A Supabase project (staging first) | Application data and Auth |
| A Cloudflare account with Workers and R2 | The API and the site |
| `wrangler` authenticated | `pnpm --filter @mukhtalif/api exec wrangler whoami` |

There is no Supabase CLI project in this repo — `apps/api/supabase/` holds
migrations only. Apply them through the Supabase SQL editor or `psql`.

**Never paste the service-role key anywhere outside `wrangler secret put`.** It
bypasses row level security. It must not enter `wrangler.jsonc`, `.env`, a
screenshot, or a commit.

---

## 1. Database migrations

Migrations `0001`–`0013` are already applied to any existing project. This
release adds two.

### 1.1 Apply, in this order

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f apps/api/supabase/migrations/0014_guests.sql
```

```bash
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f apps/api/supabase/migrations/0015_studio_invitation_acceptance.sql
```

`0015` runs inside an explicit transaction and rewrites
`provision_invited_studio_member`, so a newly invited member starts pending. If
it fails partway it rolls back whole; re-run it after fixing the cause.

`0014` is not transactional in the same way. If it fails after creating some
tables, drop the ones it created before re-running:

```bash
psql "$SUPABASE_DB_URL" -c "drop table if exists public.guest_appearances, public.guest_socials, public.guests cascade;"
```

### 1.2 Verify

```bash
psql "$SUPABASE_DB_URL" -f apps/api/supabase/verify_deployment.sql
```

Every `status` column must read `ok`. The script is read-only and re-runnable.

Section 4 is the one that matters most for this release: `0015` backfills every
pre-existing member as `active` with `accepted_at = created_at`. If any row is
`active` with a null `accepted_at`, the backfill did not run and those people
cannot be told apart from pending invitees.

Section 6 is a pre-existing gate from `MAILCHIMP_PUBLISHING.md`. It must pass
before any newsletter is ever sent, regardless of this release.

---

## 2. Supabase Auth — invitation acceptance

The invited person clicks the emailed link, lands on the Studio, and sets a
password. Two settings make that work.

### 2.1 Point the Worker at the acceptance page

The Studio's acceptance route (client work not yet built — see §6) will live at
`/invite`. Set:

```
STUDIO_INVITE_REDIRECT_URL = https://admin.mukhtalif.net/invite
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

Invite yourself at an address you control, then confirm:

1. `GET /studio/invitations/me` reports `status: "invited"`.
2. The email arrives and its link lands on the allowlisted URL with a session.
3. `POST /studio/invitations/accept` with a password of at least 12 characters
   returns `accepted`.
4. Repeating the accept returns **409 `ALREADY_ACCEPTED`**. Acceptance is
   one-time by design, so a replay cannot reopen password setup on a live
   account.

---

## 3. Cloudflare R2 and the API Worker

### 3.1 Create the buckets

```bash
pnpm --filter @mukhtalif/api exec wrangler r2 bucket create mukhtalif-audio
```

```bash
pnpm --filter @mukhtalif/api exec wrangler r2 bucket create mukhtalif-media
```

Keep both **private**. `mukhtalif-media` must not be given a public r2.dev URL:
images are served through the Worker's `/media/:id` route, which is what applies
sanitisation, immutability, and `nosniff`. A public bucket URL bypasses all of
it and cannot be withdrawn from an already-sent email.

### 3.2 Bind them

Edit `apps/api/wrangler.jsonc` and add, alongside `observability`:

```jsonc
"r2_buckets": [
  { "binding": "AUDIO", "bucket_name": "mukhtalif-audio" },
  { "binding": "MEDIA", "bucket_name": "mukhtalif-media" }
],
```

They are left commented out in the repo on purpose: binding a bucket that does
not exist breaks `wrangler dev` for everyone who has not created it.

### 3.3 Set the Worker variables

`MEDIA_PUBLIC_ORIGIN` is the API's own HTTPS origin, because the Worker serves
`/media/:id` itself. **Outside development the API refuses to start when `MEDIA`
is bound and this is unset**, which is deliberate: it would otherwise mint image
URLs against whatever origin a request happened to arrive on.

In `apps/api/wrangler.jsonc` `vars`:

```jsonc
"APP_ENV": "production",
"ALLOW_DEV_AUTH": "false",
"CORS_ALLOWED_ORIGINS": "https://admin.mukhtalif.net",
"MEDIA_PUBLIC_ORIGIN": "https://api.mukhtalif.net",
```

`CORS_ALLOWED_ORIGINS` lists the **Studio** only. The public site never calls the
API from a browser — every read happens in a server component — so it does not
belong here. A wildcard is rejected outright.

`ALLOW_DEV_AUTH` must be `false`. The `x-dev-user` header bypasses Supabase
entirely; it is gated on `APP_ENV=development` *and* this flag, and both must
fail closed in production.

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

### 3.5 Deploy and smoke test

```bash
pnpm --filter @mukhtalif/api exec wrangler deploy
```

```bash
curl -s https://api.mukhtalif.net/home | head -c 400
```

Then confirm the boundary actually holds:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://api.mukhtalif.net/studio/summary
```

This must be **401**. If it returns data, `ALLOW_DEV_AUTH` is still on.

```bash
curl -s -o /dev/null -w "%{http_code}\n" -H "x-dev-user: usr-admin-1" https://api.mukhtalif.net/studio/guests
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

## 4. *(Mailchimp — deliberately skipped, see `MAILCHIMP_PUBLISHING.md`)*

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

### 5.3 Deploy

```bash
pnpm --filter @mukhtalif/web exec wrangler deploy --var MUKHTALIF_API_URL:https://api.mukhtalif.net --var PUBLIC_WEB_URL:https://mukhtalif.net
```

`apps/web/wrangler.jsonc` ships with an empty `vars` block on purpose, so a
staging deploy cannot silently inherit a production API origin.

To build and deploy in one step instead:

```bash
pnpm --filter @mukhtalif/web deploy
```

Note that form takes its variables from `wrangler.jsonc`, so set them there
first if you use it.

### 5.4 Verify

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://mukhtalif.net/articles/<a-published-slug>
```

Then confirm, on the deployed site:

- An unpublished slug renders the Arabic 404, not an error page.
- The article canonical tag matches `PUBLIC_WEB_URL` exactly.
- **View source and search for `MUKHTALIF_API_URL`, `supabase`, and `eyJ`.** All
  three must be absent: every read is server-side and no credential or API
  origin should reach the browser.

### 5.5 A note on build-time API availability

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
