# WordPress media to R2

Uploads the verified WordPress originals from a `media-download-report.json`
snapshot to Cloudflare R2. The default mode is read-only: it downloads any
matching remote objects and compares their byte size and SHA-256 checksum.

Object keys are deterministic:

```text
legacy/wordpress/<legacyId>/<filename>
```

## Usage

```bash
pnpm tsx tools/wordpress-media-r2/src/cli.ts \
  --source-report /absolute/path/media-download-report.json \
  --report /absolute/path/r2-dry-run.json

pnpm tsx tools/wordpress-media-r2/src/cli.ts \
  --source-report /absolute/path/media-download-report.json \
  --report /absolute/path/r2-apply.json \
  --apply
```

Defaults:

- bucket: `mukhtalif-media`
- prefix: `legacy/wordpress`
- concurrency: `4` (allowed range: 1-8)
- account: `CLOUDFLARE_ACCOUNT_ID`, falling back to Mukhtalif's development
  account ID

The tool never deletes remote objects or writes to a database. `--apply` is the
only mode that uploads. Every upload passes the snapshot MIME type and is then
downloaded again for an exact size and checksum comparison. Write reports to the
backup directory so operational output stays outside Git.

## External inline article images

`external-cli.ts` extracts inline `<img>` dependencies from the WordPress
manifest. It mirrors the article importer's class-ID, exact-URL, resized-image,
and `-scaled` WXR mapping before treating a URL as external. Only unresolved
`mcusercontent.com` raster images are eligible.

```bash
pnpm tsx tools/wordpress-media-r2/src/external-cli.ts \
  --manifest /absolute/path/wordpress-manifest.json \
  --backup-dir /absolute/path/media/external \
  --report /absolute/path/external-r2-report.json

# Explicit download + R2 upload
pnpm tsx tools/wordpress-media-r2/src/external-cli.ts \
  --manifest /absolute/path/wordpress-manifest.json \
  --backup-dir /absolute/path/media/external \
  --report /absolute/path/external-r2-apply.json \
  --apply
```

The downloader sends no credentials. It pins each request to a DNS address that
was checked as public, accepts credential-free HTTPS only, validates every
redirect again, limits responses to 25 MiB, verifies file magic, MIME, and image
dimensions, and saves files with mode `0600`. External keys are deterministic:

```text
legacy/wordpress/external/<url-sha256>/<filename>
```

The JSON report includes the complete source URL to R2 key mapping required by
the later article-content rewrite.
