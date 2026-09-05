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

API secrets stay in Cloudflare. No secret-put, database migration/import, DNS
change or R2 object operation is performed by this workflow. The existing shared
R2 bindings are preserved. Never inject Hostinger credentials into this workflow.

## Verification and recovery

Guarded builds pin destinations and public development URLs. API verification
uses `/`, `/shows`, and unauthenticated `/studio/me` (401). `/health/live` is a
Node-entry-only endpoint and must not be assumed to exist on Workers. Web/Studio
checks visit `/`, `/login`, `/episodes`; Web must return `noindex`.
These are read-only smoke checks, not authenticated media-upload acceptance.

Before/after Worker deployment version lists are retained as GitHub artifacts
for 30 days. Review the before receipt and use Wrangler rollback on only the
affected Worker if needed. No automatic rollback is attempted: a partial
failure requires inspection and retry of the same verified code. Version rollback
does not roll back database schema or external data. Check token expiry periodically.
