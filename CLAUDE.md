# Mukhtalif — working notes

Operational facts that are not derivable from the code. Architecture decisions
live in `docs/adr/`; the deployment sequence lives in `docs/DEPLOYMENT.md`.

## Repository

The repo is **`dev/mukhatlif`** inside the `mukhtalif` folder, not the folder
root. Note the spelling difference: the outer folder is `mukhtalif`, the repo
directory is `mukhatlif`.

Work on **`dev`**. Never commit to `main`.

## Cloudflare

**Three accounts are reachable from this machine, so every non-interactive
`wrangler` command fails unless the account is pinned.** Both worker configs
carry `account_id`; for a bare command, export it:

```bash
export CLOUDFLARE_ACCOUNT_ID=c4b180c5ae20a242ec7024e2fc0a3478
```

| | |
| --- | --- |
| Account | `Aaahashmi95@gmail.com` — `c4b180c5ae20a242ec7024e2fc0a3478` |
| workers.dev subdomain | `mukhtalif` |
| R2 buckets | `mukhtalif-audio`, `mukhtalif-media` — both private |

**The account is shared with an unrelated project.** A second Worker, `sama-api`,
lives here and serves real traffic at `sama-api.mukhtalif.workers.dev`. The
account subdomain was originally `sama-api` and was changed to `mukhtalif` on
2026-08-21, which moved that project's hostname too. Anything account-level
affects it — check before changing account settings.

`mukhtalif.net` is **not** on Cloudflare. There are no zones, so everything runs
on `workers.dev` for now.

### Deployed

| Surface | URL |
| --- | --- |
| API | https://mukhtalif-api.mukhtalif.workers.dev |
| Studio | https://mukhtalif-admin.mukhtalif.workers.dev |
| Public site | https://mukhtalif-web.mukhtalif.workers.dev |

Preview URLs are disabled on all three. They would publish origins the API's
CORS allowlist does not name, so requests from them fail confusingly.

## Supabase

Project **Mukhtalif**, ref `pacpdxvujkjvnaeeuute`, region `eu-central-1`.

**There is no staging project.** The `main` branch is tagged PRODUCTION, so a
migration lands straight on production with no safety net.

All 15 migrations are applied. `public.schema_migrations` is the ledger.

### Applying migrations

```bash
./scripts/migrate.sh            # apply pending, then verify
./scripts/migrate.sh --verify   # read-only checks
./scripts/migrate.sh --dry      # list order, connect to nothing
```

Use the **session pooler on port 5432**, never the transaction pooler on 6543:
migration `0015` opens an explicit transaction and takes an advisory lock, and
neither survives transaction pooling. The runner refuses 6543.

`psql` is the keg-only libpq build at `/opt/homebrew/opt/libpq/bin/psql`. It is
not on PATH and nothing needs installing.

## Secrets

The root `.env.local` is the only place a Supabase value is typed. Distribute it:

```bash
pnpm env:sync
```

It writes `apps/api/.dev.vars`, `apps/admin/.env.local`, and
`apps/web/.env.local`, all gitignored, and refuses to write when the public and
secret keys are swapped — that mistake compiles an RLS-bypassing key into the
browser bundle and rotating it is the only remedy.

`SUPABASE_DB_URL` is optional. It is used only by `psql` for migrations; no
application reads it and it is never deployed.

Production secrets go in with `wrangler secret put`, never into `wrangler.jsonc`.

## Things that will bite

- **`PUBLIC_WEB_URL` is deliberately unset on the API.** It is one of six
  Mailchimp settings that must be configured together; setting it alone is
  treated as a configuration error and returns 503. More importantly, the API
  bakes absolute article links from it into sent email, and **a delivered
  message cannot be rewritten** — so do not enable Mailchimp until the final
  domain is settled.
- **Nobody can sign in to the Studio yet.** `auth.users` is empty and the seeded
  member `usr-admin-1` (`studio@mukhtalif.net`) has a null `auth_user_id`.
  Someone must create the Auth user themselves, then the UUID gets linked to
  that row. Claude does not create accounts or set passwords.
- **`x-dev-user` is inert the moment Supabase is configured**, and again in
  production. The gate needs `APP_ENV=development` *and* `ALLOW_DEV_AUTH=true`.
- **`MEDIA_PUBLIC_ORIGIN` is required whenever the `MEDIA` binding exists
  outside development.** The API refuses to start without it rather than mint
  image URLs against whatever origin a request arrived on.
- **Never give either R2 bucket a public r2.dev URL.** Images are served through
  the Worker's `/media/:id`, which is what applies sanitisation, immutability
  and `nosniff`. A public bucket URL bypasses all of it and cannot be withdrawn
  from an email already sent.

## API shape

Three namespaces, one audience and one auth model each (ADR 0007):

| Namespace | Audience | Auth |
| --- | --- | --- |
| root | anonymous catalogue | none |
| `/app/*` | signed-in listeners | an application `User` |
| `/studio/*` | operators | a `StudioMember` plus a permission |

The separation is structural. The public catalogue has **no mutating handler
mounted**, so a write returns 404 rather than being authorized and refused, and
its reads are published-only unconditionally — no permission widens them.

Clients declare themselves with `X-Client-Surface: web | mobile | studio`. It is
not an authorization input, but a surface that does not belong to a namespace is
refused before any permission check. The header is optional; an unrecognised
value is rejected rather than ignored.

## Checks

Run all four before handing anything over:

```bash
pnpm lint && pnpm type-check && pnpm test && pnpm build
```

Keep commits small and on `dev`.
