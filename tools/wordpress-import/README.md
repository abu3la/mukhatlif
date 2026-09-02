# WordPress and podcast import tooling

This folder contains repeatable WordPress preparation and apply planning. The
WXR dry run is offline. The apply command writes only through Supabase REST and
only after an explicit `--apply` plus three reviewed confirmations. It never
executes SQL, uploads to R2, or calls a WordPress write API.

The dry run reads a WordPress WXR export and writes two private files next to
the backup:

- `wordpress-manifest.json`: normalized migration candidates and deferred
  records.
- `wordpress-dry-run-report.json`: counts, checksums, conflicts, missing media
  references, and proposed redirects.

```sh
pnpm import:wordpress:dry-run -- \
  --wxr /absolute/path/to/wordpress-all.xml \
  --rest-media /absolute/path/to/rest/media-all.json \
  --output-dir /absolute/path/to/backup
```

Published posts, pages, team members, and books are migration candidates.
Attachments with `inherit` status are candidates too. Draft/private records
remain in the manifest under `deferred`, so the importer never silently loses
them.

Podcast feeds can be included with repeatable `--rss` arguments. A value may be
a local XML file or an HTTPS URL:

```sh
pnpm import:wordpress:dry-run -- \
  --wxr /absolute/path/to/wordpress-all.xml \
  --rss petroly=https://anchor.fm/s/example/podcast/rss
```

To download original media into the backup without uploading anything to R2,
add `--download-media`. Downloads go to `media/originals/<legacy-id>/`; the
source URL, final URL, byte count, MIME type, SHA-256, and any failures are
written to `media-download-report.json`. A verified existing download is
reused on the next run.

```sh
pnpm import:wordpress:dry-run -- \
  --wxr /absolute/path/to/wordpress-all.xml \
  --rest-media /absolute/path/to/rest/media-all.json \
  --download-media \
  --media-concurrency 4
```

The generated manifest contains author email addresses from the WordPress
export. Output files are created with mode `0600`; keep the backup private.

## Build the reviewed apply plan

The apply planner requires both verified R2 reports and an explicit media
delivery environment. `--offline` does not contact Supabase:

```sh
pnpm import:wordpress -- \
  --manifest /absolute/path/to/wordpress-manifest.json \
  --media-download-report /absolute/path/to/media-download-report.json \
  --r2-report /absolute/path/to/r2-media-dry-run-after.json \
  --external-r2-report /absolute/path/to/external-media-r2-dry-run-final.json \
  --environment development \
  --media-public-origin https://development-media.example.com \
  --output-dir /absolute/path/to/private-backup \
  --offline
```

The command writes these private artifacts:

- `wordpress-apply-plan.json`
- `wordpress-article-dependencies.json`
- `wordpress-external-inline-media.json`
- `wordpress-apply-dry-run-report.json`

Every imported article must have a verified cover and verified inline images.
Mapped images become editable `imageBlock` nodes that reference deterministic
media IDs. Safe image links are retained in `imageBlock.attrs.linkUrl`.
Unsupported or unverified dependencies make only that article pending.

Cloudflare Worker origins are development-only. A production plan rejects
localhost, private IPs, `workers.dev`, `pages.dev`, and the
`mukhtalif-development` hostname. Do not substitute the development Worker for
the still-required Hostinger production media delivery origin.

## Database reconciliation and apply

Migrations `0011`, `0016`, `0019`, and `0020` must be reviewed and applied
through the normal migration workflow before database reconciliation. `0020`
is a guarded compatibility migration: it widens the older development redirect
label constraint and is a no-op when a new database already carries the current
`0016` definition. A read-only database dry run uses the same source arguments
as above, without `--offline`:

```sh
SUPABASE_URL=https://PROJECT_REF.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=... \
pnpm import:wordpress -- [source and deployment options]
```

After reviewing that report, an apply additionally requires the exact project
ref, manifest checksum, and plan checksum printed by the dry run:

```sh
SUPABASE_URL=https://PROJECT_REF.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=... \
pnpm import:wordpress -- [source and deployment options] --apply \
  --confirm-project-ref PROJECT_REF \
  --confirm-manifest MANIFEST_SHA256 \
  --confirm-plan PLAN_SHA256
```

The reconciler never deletes rows. Deterministic reruns are idempotent, Studio
edits are preserved field by field, and redirect conflicts are reported rather
than overwritten.

Validation commands:

```sh
pnpm test:wordpress-import
pnpm type-check:wordpress-import
pnpm exec eslint tools/wordpress-import/src
```

Database migrations only define the target model. The tooling itself never
executes SQL.

## Recorded development apply

On 2026-09-02, plan
`8c29dfe1a7289a3782a40a134da0ff723e459d2ba154bc52970f7e80163e3014`
with manifest
`b12682df49f7cdbc535eb7ac9805930aa048e8ca45c2740bff866133fcb162d0`
was applied only to development project `pacpdxvujkjvnaeeuute`, using
`https://mukhtalif-api.mukhtalif-development.workers.dev` as the development
media origin. Under the workspace backup root, the saved apply report is
`backups/wordpress/2026-09-02/wordpress-apply-report.json`; the following
database dry run reports zero mutations in the sibling
`wordpress-apply-database-dry-run-report.json`.

This record does not authorize or describe a production import. Production
remains blocked until the Hostinger API and its public media origin pass the
release gates in the repository `AGENTS.md`.
