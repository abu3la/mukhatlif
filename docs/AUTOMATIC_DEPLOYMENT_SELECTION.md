# Automatic frontend delivery selection

The owner enabled automatic change classification on September 5, 2026.
After successful verification of a push/merge to `main`, two independent workflows
classify their changes before receiving deployment secrets:

| Files | Studio | staging Web |
| --- | --- | --- |
| `apps/admin/**` | yes | no |
| `apps/web/**` | no | yes |
| Shared `libs/**`, lockfile, root build settings | yes | yes |
| Target-specific hosting scripts/workflow | matching target | matching target |
| `docs/**`, README, AGENTS, tooling-only changes | no | no |
| `apps/api/**`, including migrations | no | no |
| Unrecognized source/build changes | yes, conservatively | yes, conservatively |

Renames are compared as deletion plus addition, so moving a component between apps
selects both. The diff starts at the last successful workflow for **that target**,
not merely the preceding main commit. A failed release does not advance that
baseline; later changes therefore include the previously unpublished code.
Successful documentation-only skips may advance the baseline without altering the
runtime. No baseline or rewritten ancestry rebuilds conservatively.

Both workflows check main again before publishing, serialize each target, and
preserve `dev`. The API and database migrations remain manual; root
`mukhtalif.net` is never a target. Changes requiring an API/schema upgrade still
need coordinated, backward-compatible releases; classification cannot infer API
compatibility from filenames.

Studio keeps its proven static release path, detailed in
`STUDIO_GITHUB_DEPLOYMENT.md`. Web uses its previously successful monorepo source
archive adapter: root `build:hostinger:web`, Node 22, pnpm, output `apps/web/.next`,
and a generated standalone launcher preserving `apps/web` internally. GitHub first
builds and runs the standalone output outside the checkout to detect missing
dependencies/assets. Hostinger then builds the same source adapter, and the
workflow checks the exact public release SHA, routes, JS/CSS and `noindex`.

Recovery: every new Web source ZIP is retained as `web-source-COMMIT` for 90 days
in GitHub Actions. If the current release's archive is expired/missing, deployment
stops for an operator to prepare recovery. Before overwriting, the workflow records
the previous provider build settings, public release and `.htaccess`. It never
guesses/replaces `.htaccess` directly. The initial September 5 manual source ZIP
was independently verified locally and is the explicitly pinned bootstrap backup:
`/Users/abu3la/dev/mukhtalif/backups/releases/20260905-web-cli/mukhtalif-20260905-web-standalone-cli.zip`,
SHA256 `749a1168763d49253de3cf8b24022f76f5706bb332626c73c362b58fe656ae5e`.
That fallback is accepted ONLY for its known build UUID and public release identity.
To restore, retrieve the matching archive, upload it through Hostinger, and use the
recorded Node build options; verify publicly before declaring recovery complete.

This enables classification and automatic targets, not a manual target-selector UI.
