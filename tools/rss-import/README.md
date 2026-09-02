# Podcast RSS importer

This tool turns the 16 saved podcast RSS feeds into one deterministic manifest
and can reconcile it with Supabase. It is read-only by default.

```sh
# Build the manifest without touching Supabase
pnpm import:rss -- --offline

# Read-only database comparison
pnpm import:rss

# Explicit database write, only after reviewing the dry run
pnpm import:rss -- --apply
```

The default source is
`../../backups/wordpress/2026-09-02/rss` relative to the repository, and the
manifest is written beside that backup as `rss-manifest.json` with file mode
`0600`. `--rss-dir` and `--manifest` can override those paths.

The apply mode requires `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the
repository `.env.local`. Their values are never printed. It first checks for the
columns and import-ledger tables created by migration `0016`.

On a later run, a feed value is updated only when the database still contains
the value from the previous import. Fields changed in Studio and lifecycle fields
such as status and premium are preserved.
