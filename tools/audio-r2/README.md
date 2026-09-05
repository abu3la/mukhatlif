# Podcast archive to private R2 and development Supabase

On 2026-09-04 the user approved the full archive copy from their Mac. The
resumable S3 multipart implementation is active. Follow
[`docs/AUDIO_R2_ACTIVE_RUN.md`](../../docs/AUDIO_R2_ACTIVE_RUN.md) for the exact
checkpoint, credential paths (never values), current commands and remaining checks.

This tool inventories podcast enclosure files (836 in the original snapshot,
841 after the September 5 additions) and prepares a deterministic migration to the private
`mukhtalif-audio` R2 bucket.

The first phase is deliberately read-only:

```bash
pnpm migrate:audio:r2 -- --env /private/development.env --report /private/new-plan.json

# Also verify every source with a body-free HTTPS HEAD request.
pnpm migrate:audio:r2 -- --env /private/development.env --report /private/new-head-plan.json --head-sources
```

The tool is hard-guarded to:

- Cloudflare account `bb4abee6bf877ef411dc803b3be96373`
- R2 bucket `mukhtalif-audio`
- development Supabase project `acomtixjibgkauzeltsn`

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

The reviewed source is about 137 GiB. The old dry-run CLI's `--apply` stays
disabled; real writes use `apply-cli.ts` with the reviewed report SHA-256 and
private pinned credentials. The implementation retains these invariants:

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

For a source cut mid-MP3-frame, the bounded 16 KiB format probe can recognize
three complete, correctly spaced Layer III frames whose first frame starts
within 4096 bytes. It rejects invalid/reserved fields, inconsistent stream
parameters, incomplete runs, and text-error wrappers. This does not trim or
rewrite the source or waive any size/hash/readback check. See the active
runbook's recorded Joker 2 diagnosis and same-checkpoint recovery; never turn a
format failure into a generic "ignore validation" flag.

Three reviewed Petroly sources are ADTS AAC despite immutable `.mp3` URLs and
upstream `audio/mpeg` declarations. `reviewed-audio-formats.ts` pins each exact
episode/show/GUID, source URL hash, key, byte count and full-body hash after full
ADTS-frame walks and successful complete decoding. Only those exact files use
initial R2 `audio/aac` delivery metadata, retaining the declared source type and
review ID. Their bytes and source/database metadata are unchanged. Transfer,
resume and audits share the same expected-type/hash guards. Never infer their
delivery MIME from the suffix or accept another disguised AAC without review.

`queue.ts` runs checksum-pinned batches sequentially, retaining one temporary
audio file at a time. It stops on a failed or incomplete batch and never moves
silently to the next one. `rss-audit.ts` records feed changes without database
access; `rss-additions.ts` can append reviewed, source-verified new development
episodes without changing existing rows. Follow the active runbook for their
current private artifacts and the exact queue resume command.

No production Supabase, Hostinger application, production DNS record, or
public R2 URL is part of this workflow.

## Independent read-only completion audit

```bash
pnpm exec tsx tools/audio-r2/src/audit.ts \
  /private/archive-queue.json APPROVED_QUEUE_SHA256 EXPECTED_FILES EXPECTED_BYTES \
  /private/r2.env /private/development.env /private/NEW-audit.json
```

The audit pins the whole queue and each source plan, validates both destination
identities, and requires the exact approved file count and byte total. It reads
the development rows and issues R2 HEAD requests for checkpoint-verified objects.
It does not upload, replace, relink, restart a job, or modify a checkpoint.

For every completed object, size, MIME, ETag and SHA-256/source-hash metadata
must still match the earlier **full-body readback** proof. The original URLs,
show, RSS GUID and development key must also match. HEAD is not a new full-body
download. A pending file or running batch can never pass the final scope gate.

Exit `0` means the complete transfer scope passed; `2` means a valid report was
written but the scope is incomplete (including a normal in-progress snapshot);
`1` means the audit could not run safely. Inspect the report's counts and errors
instead of treating every `2` as a failed upload. Output is a new private file
outside Git. Transfer-scope completion does not replace RSS/content review,
streaming tests, or real browser acceptance.

Public streaming checks must distinguish the source/R2 MIME from the canonical
delivery MIME: a preserved `audio/x-m4a` object is served as `audio/mp4`, and
`audio/mp3` as `audio/mpeg`. The API normalizes only these known legacy aliases;
do not modify immutable R2 metadata or widen the Studio upload allowlist. Test
both whole-response headers and first/last byte ranges against direct R2 bytes.

## YouTube source review

The metadata tools are read-only until an explicit apply command. They never
download YouTube media. `youtube-search.ts` is discovery only; search results
are not accepted as episode links. `youtube-channels.ts` scopes the six reviewed
publisher sources to their known shows, including the original pre-2022 KFUPM
producer of Petroly. Do not add a channel from its name alone.

`youtube-inventory.ts OUTPUT [videos|streams] [main|jinai|riyadi|stage|programs|kfupm]`
records public inventory. Enrich and combine it before matching. Automatic
matching requires unique exact-title or long episode-specific description
evidence, compatible duration and public metadata. Repeated generic program
introductions are excluded.

`youtube-reviewed.ts REVIEW SHA256 RSS CHANNEL PRIVATE_DEV_ENV PRIVATE_RESULT`
applies a **recorded manual review**, not a fuzzy search. The review must pin both
source hashes and explain the paired episode identity. Its guest/title, date,
duration and publisher guards supplement that editorial review. Existing links,
premium rows and source-identity conflicts are preserved with a before-image.

For a renamed episode with no useful RSS description,
`youtube-content-reviewed.ts REVIEW SHA256 RSS CHANNEL PRIVATE_DEV_ENV PRIVATE_RESULT`
accepts a separately recorded spoken-content review. It pins the original audio
report, two local transcript files and the public caption track by SHA-256.
Two distant 60–90-second source windows must contain unique shared passages;
the full-duration (2 seconds), publication (4 days) and approved-publisher gates
still apply. The reviewer must actually compare the conversation, not approve
from a transcript score. Original source URLs are protected by database CAS.

`review-clip.ts REPORT SHA EPISODE START SECONDS PYTHON LOCAL_MODEL PRIVATE_OUTPUT`
produces supporting local speech evidence. It requires an existing absolute
Python/model path, verifies the approved source, streams no more than 90 seconds
through memory, and writes only a private JSON transcript. It never downloads
a model or additional full audio file. The transcript can be inaccurate and is
not an automatic identity decision. Never fix an upstream wrong/teaser-only RSS
audio file by silently substituting a YouTube download or changing source data.

`youtube-edition-reviewed.ts REVIEW SHA RSS CHANNEL DEV_ENV OUTPUT` is a
separate, explicit editorial path for different published cuts of the same
recording. It requires the named guest in both records, a reviewed publisher,
2–3 distant and chronological source/caption passages, checksum-pinned evidence,
explicit observed dates/durations, and an explanation of the difference. A text
overlap check catches mismatched evidence; it does not decide identity. The
reviewer must compare the actual conversation. This path does not relax the
automatic or exact-duration matchers, replace audio, or edit its metadata.
See the active runbook for the four applied reviews and upstream source issues.

Generate a new report after a matcher change; never edit an old report to make
its checksum or decisions pass. Refer to the active runbook for current audits
and the unresolved audio/video differences.

The historical staged execution and rollback proposal is documented in
[`docs/AUDIO_R2_WEEKEND_MIGRATION.md`](../../docs/AUDIO_R2_WEEKEND_MIGRATION.md).
Its batch-by-batch approval proposal was superseded by the user's full-archive
authorization. Production database writes and deployment are still not approved.
