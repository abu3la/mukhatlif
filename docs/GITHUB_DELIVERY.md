# GitHub source, manual delivery

Mukhtalif has one source tree. Cloudflare development and Hostinger production
must build from this repository; neither provider owns a separate copy of the
application.

## Branch contract

- `dev` is the Cloudflare development integration branch.
- `main` is the protected Hostinger production source branch.
- A reviewed pull request from `dev` to `main` creates a release candidate. It
  does not publish or authorize publishing.
- Provider adapters may differ, but routes, schemas, UI, validation, and
  business rules remain shared.

## Manual deployment contract

- GitHub Actions verifies source and builds disposable artifacts only. It has no
  Cloudflare or Hostinger deployment job.
- Pushes, merges, and tags never deploy either environment automatically.
- Hostinger applications are connected only to `main`, with automatic deployment
  disabled. An operator starts each deployment manually from hPanel.
- Cloudflare development deploys also use the guarded package scripts manually.
- Before a Hostinger deployment, record the approved commit SHA, verify all CI
  jobs passed for that SHA, and confirm `origin/main` still points to it. Freeze
  merges until the API, Studio, and Web smoke tests finish.
- Deploy production in this order: API, API smoke tests, Studio, Web, end-to-end
  smoke tests. A new explicit user instruction is required for every release.
- The acceptance Web deploy uses `https://staging.mukhtalif.net` with global
  `noindex`; `https://mukhtalif.net` remains on the previous site until a later
  cutover approval.

If a provider integration cannot guarantee that a push will not deploy, do not
activate it. Manual-only delivery is a release gate, not a preference.

The acceptance release is authorized for `api.mukhtalif.net`,
`studio.mukhtalif.net`, and the noindex `staging.mukhtalif.net` Web app. It must
still pass every gate below and remains manual; GitHub Actions never publishes.

## Current verification

`.github/workflows/verify.yml` runs for pull requests and pushes targeting
`dev` or `main`. It has read-only repository permission and contains no
deployment job.

It verifies three independent concerns:

1. Workspace lint, TypeScript, application tests, and content-import tooling.
2. Cloudflare development bundles: API Worker, Studio static Worker, and the
   OpenNext Web Worker. Wrangler is invoked only with `--dry-run`; no upload or
   provider authentication occurs.
3. Hostinger production bundles: the Hono Node.js API, Vite Studio, and native
   Next.js Web build.

CI uses inert public browser configuration solely to exercise the production
build paths. Those bundles are discarded and are never release artifacts.

## Secret boundary

GitHub does not need Supabase service keys, Resend keys, R2 credentials, or
Hostinger credentials for verification. Live values stay in provider-managed
environment stores:

- Cloudflare development secrets live in Cloudflare.
- Hostinger production secrets live in hPanel.
- GitHub holds no live provider deployment credential while the manual-only
  policy is active. Adding one requires a later explicit policy change.

The Hostinger environment guard is intentionally not executed in generic CI.
It validates the actual environment and must run in Hostinger before its build
and start commands. Supplying fake secret-shaped values in GitHub would make
that guard meaningless.

## Activation for the authorized acceptance release

For the user-authorized 2026-09-02 acceptance release:

1. Require all three workflow jobs as branch-protection checks on `dev` and
   `main`.
2. Keep Cloudflare deployment manual. Run the guarded package deployment scripts
   only after selecting a verified `dev` commit and obtaining explicit approval.
3. Connect Hostinger Web, Studio, and API applications to this repository's
   `main` branch through Hostinger's GitHub integration, with automatic deployment
   disabled. Configure production variables in hPanel and keep the API production
   guard in pre-build/start.
4. For each release, record and verify the exact `main` SHA, then trigger API,
   Studio, and Web manually from hPanel in that order.
5. Do not upload ZIP files, copy source into hPanel, or edit generated output on
   either provider.

Until those steps pass, GitHub proves that the same source can produce both
runtime targets and stops there.
