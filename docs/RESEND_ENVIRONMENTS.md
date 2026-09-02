# Resend environments and runtime ownership

This document is the source of truth for form email. The two environments use
different Resend sender domains and restricted API keys. A key must never be
copied between them.

## Ownership matrix

| Concern               | Development                                                                   | Production                                 |
| --------------------- | ----------------------------------------------------------------------------- | ------------------------------------------ |
| Application host      | Cloudflare Workers                                                            | Hostinger Node.js applications             |
| `APP_ENV`             | `production` on the public Worker; `development` only in local `wrangler dev` | `production`                               |
| `DEPLOYMENT_PLATFORM` | `cloudflare-workers`                                                          | `hostinger`                                |
| `RESEND_ENVIRONMENT`  | `development`                                                                 | `production`                               |
| Sender domain         | `devmail.mukhtalif.net`                                                       | `notify.mukhtalif.net`                     |
| API key               | Restricted development sending key                                            | Separate restricted production sending key |
| Form recipients       | Every type goes to `aaahashmi95@gmail.com`                                    | Routed to the responsible team             |

The public development Worker deliberately keeps `APP_ENV=production` and
`ALLOW_DEV_AUTH=false`. Although it is a development deployment, it is a public
URL and must keep authentication, rate limiting, and media behavior fail-closed.
`DEPLOYMENT_PLATFORM` and `RESEND_ENVIRONMENT` distinguish its email role.

Cloudflare owns development deployments and R2 storage only. The production web
and API applications run as Hostinger Node.js deployments. Production may read
objects from R2, but it must publish them through the production API or an
approved production media hostname. It must never persist or emit a
`*.workers.dev` media URL.

## Locked form routing

Development routes all six forms to the account owner's test inbox:

```json
{
  "sponsorship": ["aaahashmi95@gmail.com"],
  "partnership": ["aaahashmi95@gmail.com"],
  "guest_suggestion": ["aaahashmi95@gmail.com"],
  "careers": ["aaahashmi95@gmail.com"],
  "production_service": ["aaahashmi95@gmail.com"],
  "guest_review": ["aaahashmi95@gmail.com"]
}
```

Production routing is:

```json
{
  "sponsorship": ["bd@mukhtalif.net"],
  "partnership": ["bd@mukhtalif.net"],
  "guest_suggestion": ["pr@mukhtalif.net"],
  "careers": ["hr@mukhtalif.net"],
  "production_service": ["bd@mukhtalif.net"],
  "guest_review": ["pr@mukhtalif.net"]
}
```

`apps/api/src/env.ts` enforces the complete matrix: Resend environment,
deployment platform, sender domain, and every recipient. Partial routing and a
cross-environment value fail before the provider is contacted. Requests remain
stored in Studio even if delivery is unavailable.

## 1. Create and verify the two Resend environments

1. Create the development and production projects/environments in Resend.
2. Add `devmail.mukhtalif.net` only to development.
3. Add `notify.mukhtalif.net` only to production.
4. Copy the DNS records exactly as Resend generates them into Hostinger DNS,
   which is authoritative for `mukhtalif.net`. Do not guess record names,
   priorities, or values.
5. Wait until each domain is shown as verified before enabling its key.
6. Create one sending-only API key in each environment. Give them distinct
   names such as `mukhtalif-forms-development` and
   `mukhtalif-forms-production`.

The key separation is also a domain boundary: each key should be restricted to
its own sending domain whenever the Resend account supports that restriction.
The application cannot infer a key's dashboard permissions from the opaque key
text, so the domain restriction is a required provider-side safeguard.

## 2. Development on Cloudflare

The non-secret development policy is committed in `apps/api/wrangler.jsonc`.
Store only the restricted development key in Cloudflare:

```bash
pnpm --filter @mukhtalif/api exec wrangler secret put RESEND_API_KEY
```

Use the guarded deploy command:

```bash
pnpm --filter @mukhtalif/api deploy
```

It refuses to deploy if `wrangler.jsonc` contains the Hostinger/production
profile, a real team recipient, an enabled dev-auth bypass, or a committed API
key. Calling `wrangler deploy` directly bypasses this preflight and is not an
approved release path.

For local work, copy `apps/api/.dev.vars.example`. `pnpm env:sync` can also
receive an optional `RESEND_DEVELOPMENT_API_KEY` from the gitignored root
`.env.local`; it never prints the value.

## 3. Production on Hostinger

The production API and public web application are Hostinger Node.js
deployments. Use `apps/api/.env.production.hostinger.example` only as a list of
variable names and non-secret policy values. Enter secrets in Hostinger's
environment-variable panel, not in a committed file.

Before a production build or start, run:

```bash
pnpm --filter @mukhtalif/api verify:hostinger-production
```

Make this command a mandatory Hostinger pre-build/pre-start step. It requires
the production route matrix and a non-development media origin. It prints only
the names of invalid variables, never their values.

The shared Hono API now has a Hostinger Node entry point at
`apps/api/src/node.ts` and an R2 S3-compatible adapter at
`apps/api/src/storage/r2-s3.ts`. Build it with:

```bash
pnpm --filter @mukhtalif/api build:hostinger
```

Start the generated `apps/api/dist/node.cjs` bundle with:

```bash
pnpm --filter @mukhtalif/api start:hostinger
```

Both commands run the production environment guard. Hostinger must provide
`PORT`, `TRUST_PROXY_HOPS`, and the five `R2_*` values listed in the environment
example. The implementation and shared API contract pass locally, but live R2
credentials and the Hostinger reverse-proxy hop count still need a preview
deployment smoke test during the authorized acceptance release. Do not point
public DNS at either the preview or development Worker before that verification.

## 4. Supabase Auth email is separate

Form notifications use the Resend HTTP API described above. Supabase Auth uses
custom SMTP and must have its own restricted credential and sender domain, for
example `auth.mukhtalif.net`. Do not reuse either form API key as the Supabase
SMTP password.

Auth invitations cannot use the form-routing catch-all. In development, invite
only `aaahashmi95@gmail.com`. In production, Supabase sends to the actual invited
member after the Studio authorization check. Test the development invitation
flow with the owned address before enabling production SMTP.

## 5. Release verification

Development:

1. Run the Cloudflare guard and API tests.
2. Submit one request of each of the six types.
3. Confirm all six are saved in Studio and delivered only to
   `aaahashmi95@gmail.com`.
4. Confirm the sender uses `devmail.mukhtalif.net`.

Production:

1. Run the Hostinger environment guard during the deployment.
2. Confirm `MEDIA_PUBLIC_ORIGIN` is the production API/custom media origin and
   not `workers.dev`.
3. Use an explicit release test for each route before opening public traffic.
4. Confirm Studio still retains the request if Resend rejects a test delivery.

If any routing check fails, remove/disable `RESEND_API_KEY`. Intake continues
and notifications become `unconfigured`, so they can be retried from Studio
after the environment is corrected.
