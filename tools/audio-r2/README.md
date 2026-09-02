# Podcast audio to development R2

This tool inventories the 836 podcast enclosure files imported from the saved
RSS feeds and prepares a deterministic migration to the private
`mukhtalif-audio` R2 bucket.

The first phase is deliberately read-only:

```bash
pnpm migrate:audio:r2

# Also verify every source with a body-free HTTPS HEAD request.
pnpm migrate:audio:r2 -- --head-sources
```

The tool is hard-guarded to:

- Cloudflare account `bb4abee6bf877ef411dc803b3be96373`
- R2 bucket `mukhtalif-audio`
- development Supabase project `pacpdxvujkjvnaeeuute`

The JSON report is written with mode `0600` outside Git. It contains counts,
declared bytes, size/duration/bitrate distributions, per-show totals, source
HEAD validation, possible duplicates based on strong ETag plus byte size, the
current DB comparison, and the exact deterministic object key for every
episode.

Object keys are immutable per canonical source URL:

```text
legacy/podcasts/source/<source-url-sha256>.mp3
legacy/podcasts/source/<source-url-sha256>.m4a
```

## Apply safety contract

The current reviewed source is about 137 GiB, so `--apply` remains fail-closed
until the user explicitly approves the storage/transfer plan. The apply phase
must retain these invariants when unlocked:

1. Never delete an R2 object.
2. Never overwrite a mismatched existing object.
3. Download one source at a time to bounded private temporary storage, compute
   its SHA-256 and exact size, and validate the audio magic/MIME.
4. Upload only a missing deterministic key.
5. Download the R2 object directly and verify exact size and SHA-256.
6. Set `episodes.audio_key` only after successful R2 verification.
7. Use a compare-and-set update requiring the current `audio_key` to remain
   null and the current `audio_url`, `source_url`, and `rss_guid` to still match
   the reviewed snapshot. A Studio edit is reported as a conflict and preserved.
8. Checkpoint the private report after each episode so an interrupted run can
   resume without deleting or repeating verified work.

No production Supabase, Hostinger application, production DNS record, or
public R2 URL is part of this workflow.

The reviewed staged execution and rollback plan is documented in
[`docs/AUDIO_R2_WEEKEND_MIGRATION.md`](../../docs/AUDIO_R2_WEEKEND_MIGRATION.md).
It does not authorize apply; the tool remains locked until a new explicit
approval is given for a named batch.
