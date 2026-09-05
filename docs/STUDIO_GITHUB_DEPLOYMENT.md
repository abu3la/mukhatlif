# Studio production delivery

GitHub CLI uses `abu3la`; the canonical repository is `abu3la/mukhatlif`.
The owner authorized automatic Studio production deployment after a main merge.
This supersedes the historical manual-only policy for **Studio only**.
Development stays on `dev` and Cloudflare. Never deploy this workflow to the root
WordPress website, API, staging Web or development Supabase.

## Why verification was green without deploying

`verify.yml` intentionally only builds and tests. Its public environment values
are inert fixtures, not deployment credentials. The previous successful manual
release built Vite and uploaded a prebuilt static archive. There was no equivalent
GitHub delivery step. A green verification run did not mean Hostinger received it.

## One shared path

| Stage         | GitHub and manual CLI                                                         |
| ------------- | ----------------------------------------------------------------------------- |
| Source        | Verified current `main` commit, repository root                               |
| Runtime/tools | Node 22, lockfile pnpm version, Hostinger CLI 3.30.0                          |
| Build         | `pnpm --filter @mukhtalif/admin build:hostinger`                              |
| Output        | `apps/admin/dist`                                                             |
| Archive root  | `index.html`, `.htaccess`, `assets/`, fonts and skill downloads               |
| Transfer      | Hostinger upload URL and TUS POST/PATCH                                       |
| Deploy        | `hosting websites deploy-static-site-archive u916712841 studio.mukhtalif.net` |
| Proof         | Exact commit in `/release.json`, hashes of all public files, four SPA routes  |

`deploy-studio.yml` runs only after the verification workflow succeeds on a push
to `main`. It checks that main still matches before building and publishing.
The deployment is serialized and never cancelled halfway by a newer merge.
All four release phases use `scripts/deploy-hostinger-studio.mjs`:
`prepare`, `backup`, `deploy`, `verify`, each accepting one external release directory.
Do not upload the monorepo as the static archive or rebuild remotely with CI fixtures.

GitHub Actions secrets are `HOSTINGER_API_TOKEN` and `STUDIO_PRODUCTION_ANON_KEY`.
Only the production public anon key goes into the browser; never service-role keys.
The Hostinger token is passed only to backup and deployment steps. The CLI binary
is downloaded from Hostinger's official release and its pinned SHA-256 is checked.

Before replacement, all served files and the existing SPA configuration are saved
in `rollback.zip`. The workflow uploads that recovery artifact **before** deploying.
It retains rollback artifacts and JSON receipts for 30 days. To recover, review the
archive for the affected release and use the same static deployment command, then
check the recovered routes and assets. Do not automatically roll back over a later
release or modify unrelated services. Existing known .htaccess final LF is recovered
only if both the provider byte count and tracked file agree.

A workflow success proves static delivery and deep-link fallback, not authenticated
editing, audio playback, or email delivery. Those remain separate acceptance checks.
