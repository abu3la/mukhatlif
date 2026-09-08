# Development automatic delivery

Owner authorization: September 5, 2026. A successful verification of a push/merge
to `dev` selects and publishes changed applications to the existing Cloudflare
development account. PR checks alone never deploy. `main` still selects Hostinger
Studio and staging Web; production API and all database migrations remain manual.

| Changed paths                                                          | Development target |
| ---------------------------------------------------------------------- | ------------------ |
| `apps/api/**` except `supabase/**`                                     | API Worker         |
| `apps/admin/**`                                                        | Studio Worker      |
| `apps/web/**`                                                          | Web Worker         |
| Shared libraries, lockfile, root configuration, unknown paths          | All three          |
| Documentation, migration files, import tooling, Hostinger-only scripts | None               |

The baseline is the last successful development delivery workflow, not merely the
previous commit. Failed or partial deliveries do not advance the baseline. An
initial run or rewritten history conservatively selects all applications. API
publishes before consumers; failures stop the remaining steps. Concurrency prevents
overlapping development releases, and current `dev` SHA is checked before publishing.
Commits must be trusted: deployment executes checked-out `dev` code with credentials.

## Activation

The workflow must exist on the default branch (`main`) for `workflow_run` events.
Merge the reviewed implementation into `dev` and then `main`, retain `dev`, and
trigger a fresh verified `dev` push after the default-branch installation.
Do not claim activation until a real triggered delivery completes.

GitHub repository/environment secrets required:

- `CLOUDFLARE_DEVELOPMENT_API_TOKEN`: scoped to account
  `bb4abee6bf877ef411dc803b3be96373`, with permissions needed by Wrangler to edit
  the existing Workers and read deployment versions. Use a dedicated CI API token,
  not the local Wrangler OAuth session or an R2 S3 access key.
- `STUDIO_DEVELOPMENT_ANON_KEY`: matching Supabase project `acomtixjibgkauzeltsn`,
  `anon` role only. The build guard rejects production or service-role keys.

API secrets stay in Cloudflare. Web receives only the matching public development
Auth configuration through its Worker bindings. No database migration/import, DNS
change or R2 object operation is performed by this workflow. The existing shared
R2 bindings are preserved. Never inject Hostinger credentials into this workflow.

### Current release: verified manual development Web Auth bindings

As of 8 September 2026, the active workflow on the default branch `main` is older
than the Web Auth binding-upload step in this branch. A passing PR check or the
presence of `STUDIO_DEVELOPMENT_ANON_KEY` does not configure the running Web Worker.
The operator installed and verified the following bindings on the existing
development Web Worker at `2026-09-08T07:36:27.376Z`. Until the updated workflow
is active, these preprovisioned bindings must be preserved and checked after release:

| Binding                         | Development value                                                                                                                |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `MUKHTALIF_SUPABASE_URL`        | `https://acomtixjibgkauzeltsn.supabase.co`                                                                                       |
| `MUKHTALIF_SUPABASE_ANON_KEY`   | The matching development project's public `anon` key from the approved credential source; never a service-role or production key |
| `MUKHTALIF_GOOGLE_AUTH_ENABLED` | `false`                                                                                                                          |

Both `config` and `browser-env` guards passed. The initial Worker secret inventory
was empty; the post-write inventory contains exactly the three names above.
Account `bb4abee6bf877ef411dc803b3be96373`, Worker `web`, moved from version
`72c074ee-1342-4045-aefd-384378daf0ef` to
`7db9bea8-11f0-4974-bb12-fbe285e4fb9e` at 100% traffic. The existing development
API and public Web origin bindings were verified unchanged. This was a
configuration-only update of the existing Web deployment; no API, Studio or
production deployment was performed by this step.

The private verification receipt is
`/private/tmp/mukhtalif-web-auth-bindings-rzktzx/verified-receipt.json`.
Before/after deployment and binding metadata are stored beside it in mode-0600
files within a mode-0700 directory. Credential values are not copied into this
document or Git. Retain the receipt with the release's private evidence.

The reviewed `browser-env` helper accepts the development public key through
`DEVELOPMENT_ANON_KEY` and writes a mode-0600
`$RUNNER_TEMP/web-auth-development.json` containing those three bindings. Use an
operator-owned temporary directory and the approved secret source; do not put
key values in command history, documentation or committed files. With that
environment prepared, the manual development-only configuration step is:

```bash
node scripts/verify-development-release.mjs config
node scripts/verify-development-release.mjs browser-env
pnpm --filter @mukhtalif/web exec wrangler secret bulk "$RUNNER_TEMP/web-auth-development.json"
```

Recheck the running Web Auth configuration after publication. Installing these
bindings neither applies migrations nor configures Supabase SMTP, and is not
evidence of a completed release or successful customer authentication. Retain
API-first publication and the customer-schema readiness check before consumers.

### Verified development prerequisites, 8 September 2026

Development Supabase access has been restored. On project `acomtixjibgkauzeltsn`,
the existing 0023 schema was verified and only its missing migration-ledger row
was inserted; the 0023 DDL was not rerun. Migration
`0024_customer_accounts_library.sql` was subsequently applied and verified at
`2026-09-08T07:28:10.883Z`, following a separate verified database/Auth backup.
Receipt metadata and hashes are recorded in `design-handoff-audit.md`; restricted
backups remain outside the repository. Production was not migrated by this work.

The development Supabase Site URL is now
`https://web.mukhtalif-development.workers.dev`. Nine scoped Web callback/reset
and Studio invitation redirect patterns are saved; the exact allowlist is in
`design-handoff-audit.md`. Email signup and confirmation are enabled, while
Google is disabled. The separate `auth.devmail.mukhtalif.net` domain is now
verified in Resend. Custom SMTP remains disabled: automatic approval review
rejected issuance of the dedicated, domain-restricted sending key and requires
explicit owner approval for that credential. Hosted email, customer/library and attachment
acceptance, coordinated deployment and final visual sign-off remain outstanding.

## Verification and recovery

Guarded builds pin destinations and public development URLs. API verification
uses `/`, `/shows`, unauthenticated `/studio/me`, `/app/account` and
`/app/library` (401), plus `/health/customer-schema` (200 with `ready: true`).
The schema check must pass after API publication and before either consumer
publishes. Missing migration 0024 or its tables stops the release; the workflow
never applies migrations itself. `/health/live` is a
Node-entry-only endpoint and must not be assumed to exist on Workers. Web/Studio
checks visit `/`, `/login`, `/episodes`; Web must return `noindex`.
These are read-only smoke checks, not authenticated media-upload acceptance.

Before/after Worker deployment version lists are retained as GitHub artifacts
for 30 days. Review the before receipt and use Wrangler rollback on only the
affected Worker if needed. No automatic rollback is attempted: a partial
failure requires inspection and retry of the same verified code. Version rollback
does not roll back database schema or external data. Check token expiry periodically.
