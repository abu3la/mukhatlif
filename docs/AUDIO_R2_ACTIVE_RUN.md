# Archive migration: development verification and handoff

Started 2026-09-04 after the user explicitly approved copying **all** archive
audio from their Mac, adding verified YouTube episode links, and using embedded
video and its thumbnail. Production application/database release is not approved.

## Exact scope

Latest outcome: [September 5 browser acceptance](AUDIO_R2_BROWSER_ACCEPTANCE_20260905.md)
now closes the archive playback, YouTube save/clear and responsive UI gates.
The user deferred the ten editorial exceptions to the linked Notion task below.
All 841 source files are transferred and verified. The separate test of a new
Studio audio upload still awaits user file selection / Chrome extension file
access; do not claim that test passed or that browser multipart was implemented.
Old locked-browser/blocker notes below are historical, superseded by this result.

- Repository: `/Users/abu3la/dev/mukhtalif/dev/mukhatlif`, branch `dev`.
- Cloudflare account: `bb4abee6bf877ef411dc803b3be96373`.
- Shared private R2 bucket: `mukhtalif-audio`. No public access was enabled.
- Database writes: **only** `acomtixjibgkauzeltsn` (Mukhtalif-Dev).
- Production `pacpdxvujkjvnaeeuute`, Hostinger, DNS, root WordPress and Mailchimp
  remain unchanged. Never run this importer against production.
- Snapshot: 836 RSS files, 147,181,415,728 bytes (137.07 GiB), MP3/M4A.
  September 5 audit of all 16 feeds found 5 additions (633,740,012 bytes),
  1 removed RSS item, and no changed audio sources. The removed item is retained.
  The active archive union is **841 files, 147,815,155,740 bytes (137.66 GiB)**.
  Both batches completed at September 5, 03:33 UTC: **841 verified and linked**.
  Final provider, public delivery, RSS freshness and browser acceptance must be
  recorded separately below; the checkpoint alone does not prove them.

## Completed-copy verification (September 5)

Private receipts are in `/Users/abu3la/dev/mukhtalif/backups/audio-r2/2026-09-04/`.
Do not restart the queue: both batches are complete.

- `archive-transfer-completion-20260905.json` records **841 files,
  147,815,155,740 bytes**, all verified and linked, at 03:37 UTC. Both original
  plan hashes and the queue hash are unchanged. No matching transfer process,
  checkpoint lock or `.download` file remains. All **841 before-images** and
  two explicitly retained reviewed originals remain recoverable. No R2 or source
  object was deleted and no production database release occurred.
- `scope-audit-20260905-complete841.json` completed at 03:34:59 UTC with
  `scopeComplete: true` and **zero failures**. All 841 current R2 objects match
  their previous complete-body readback size/hash metadata/ETag, all development
  keys match, and all 841 source URL/GUID/show identities remain intact.
  This is current provider evidence against earlier complete-body proofs,
  not a second full download of the whole archive.
- `rss-audit-final-20260905/audit.json` fetched all 16 feeds after copy completion
  and found **840 current RSS episodes, zero additions, zero removals and zero
  audio changes** relative to the September 5 snapshot. The archive remains 841
  because it deliberately retains the one episode already removed in the prior
  RSS comparison. No new database import was needed.
- `local-regression-verification-20260905-final.json` records **1046 passing
  tests**: API 470, Studio 430, Web 67, archive/RSS 74, deployment scripts 5.
  All 22 uncached workspace type/lint tasks, separate tool type/lint checks,
  and Node.js 22-target bundle build passed. Before/after manifests of 544
  source/config files are identical, SHA-256
  `0bb02fea19e7fa08a3519a91da27b9d0146957db3453d0597cf38216b65d90bc`.
  Tests actually ran on Node 26.3.0. No deployment or provider mutation occurred.
- `development-delivery-audit-20260905-full841.json` completed at **03:41:20 UTC**:
  **841/841 files, 1682 fresh first/last-byte requests, zero failures**. Every
  response was HTTP 206, with exact range/length and canonical MIME, `nosniff`,
  byte-range support and no redirect. Every 1024-byte result matched the same
  direct private R2 range; the current R2 ETag and expected metadata matched too.
  This includes all three reviewed AAC sources served as `audio/aac`, the five
  M4A cases served as `audio/mp4`, and the recovered mid-frame Joker MP3.
  This is complete transport coverage, not a browser-decoder or content verdict.
- `development-readiness-final-20260905.json` confirms API, Web and Studio root
  responses are 200 and unauthenticated `/studio/me` is correctly 401. It neither
  logs a user in nor proves a successful authenticated Studio save.
- `archive-verification-handoff-20260905.json` hash-pins the receipts above and
  records each AAC recovery proof. A fresh read of all **850 development rows**
  confirmed **831 YouTube links**, all identical to their reviewed IDs, and the
  same **10** deliberately unlinked exceptions. No link drift or provider writes.

The remaining acceptance is not hidden: authenticated development Studio
save/clear, final desktop/mobile visual review, and actual browser playback of
the reviewed AAC/Joker cases are pending. The September 5, 03:39 UTC computer-use
attempt could list Chrome's Mukhtalif-Dev window but could not access its
accessibility window (`permission_denied`); the read-only permission report
still says Accessibility and screenshots are granted. No permission reset or
account change was made. The earlier browser tool explicitly reported a locked
Mac. Ask the user to unlock the Mac and keep Chrome visible before another UI
attempt; do not claim their Supabase login alone completed this acceptance.
The 10 unresolved YouTube/source exceptions below also remain open. The Arabic
[review queue](AUDIO_R2_REVIEW_QUEUE.md) lists their episode/candidate links and
the exact source files or manual content comparisons needed to resolve them.

At **03:49:46 UTC**, one bounded final Chrome check returned the same
`permission_denied` / visible-windows-but-no-accessibility-window error. The
remaining blocker has persisted across three consecutive goal turns; all
independent copy/provider/transport/local-test work and the review handoff are
finished. The overall goal is **blocked, not complete**, awaiting an accessible
unlocked browser and the missing source/content decisions. Do not restart the
finished transfer, endlessly repeat passing audits, reset permissions, invent
video matches, or advance production. Resume UI observation after the user
confirms the desktop is available, then work through the review queue.

## User-authorized editorial deferral (September 5)

The user subsequently asked to retain the review file, create a Notion task for
the ten exceptions, and finish the technical work. This supersedes the earlier
requirement to resolve those ten editorial decisions in this transfer task.
All ten original audio files already transferred and passed the same integrity
and transport checks as the rest of the 841-file archive. No extra copy,
replacement source, guessed video match, production release or data deletion is
authorized by the deferral.

[مراجعة الحلقات العشر بعد نقل الأرشيف إلى R2](https://app.notion.com/p/3d2ab5ab63da815cb475c2f4ec2a528b?pvs=204)
was created and fetched back successfully in the existing Tasks database,
related to «البنية التقنية لمختلف: الموقع والتطبيق», with status «لم تبدأ».
The actual `AUDIO_R2_REVIEW_QUEUE.md` was attached (8,844 UTF-8 bytes at creation),
and its local copy remains in the repository. No owner, deadline, schema change,
or claim that the exceptions are resolved was added.

Chrome became accessible and the authenticated development Studio displayed
«هاشمي - تطوير» during the resumed turn. Earlier locked/inaccessible-browser
notes above are historical. Actual upload, authenticated save/clear and final
visual/playback checks must each have their own result; this state change alone
does not make them pass.

## Credentials and artifacts

All credentials and backups are outside Git, mode 0600; directories are 0700.
Never print values, put keys into command arguments, or copy service keys into
browser builds.

- R2: `/Users/abu3la/.config/mukhtalif/secrets/r2-archive.env`.
  Token name `mukhtalif-local-archive-20260904`, expires **2026-09-11**,
  object read/write limited to `mukhtalif-audio`. Existing production token untouched.
- Dev service key: `/Users/abu3la/.config/mukhtalif/secrets/supabase-development.env`.
- Dev browser anon key: `/Users/abu3la/.config/mukhtalif/secrets/studio-development.env`.
- Approved report: `/Users/abu3la/dev/mukhtalif/backups/wordpress/2026-09-02/audio-r2-dry-run.json`.
- Report SHA-256: `717cad20c3e28aca248fb7eebd9f3e16d45d44049685dc6351c5f6c4bbaa175f`.
- Checkpoint: `/Users/abu3la/dev/mukhtalif/backups/audio-r2/2026-09-04/checkpoint.json`.
- Latest completed log: same directory, **`transfer-resume-aac-reviewed-20260905.log`**. Previous logs
  `transfer.log`, `transfer-dev.log`, `transfer-queue.log` and
  `transfer-resume-mp3-20260905.log` and `transfer-resume-aac-20260905.log`
  are retained as history.
- Queue: `archive-queue.json`, sequentially runs the 5 new files using
  `additions-checkpoint.json`, then resumes the original `checkpoint.json`.
  The first supervisor `79423` stopped on the MP3 prefix check described below;
  recovery `6292` later stopped on the mislabeled AAC source described below.
  Recovery `30193` then stopped on a second AAC source at 816/841. The final
  reviewed recovery supervisor was `31453`; it completed the entire queue.
  Never reuse a historical PID without checking its actual live command.
- Each checkpoint's `.lock` contains the actual job PID while running. `transfer-resume-aac-reviewed-20260905.log.pid` records the
  detached supervisor PID. Do not assume either remains current after a restart.
- Before-images: `<source-url-sha256>.before.json` beside the checkpoint.
- YouTube evidence, full episode before-images, and applied reports:
  `/Users/abu3la/dev/mukhtalif/backups/youtube/2026-09-04/`.

The September 2 report predates the production/dev split. Its file-copy plan is
accepted only for the pinned R2 destination; its old Supabase ref grants **no**
database authority. Every link rechecks current development provenance and uses CAS.

## Running and resuming

The initial three canaries (small MP3, M4A, largest ~640 MB MP3) passed direct
R2 read-back size/SHA-256 verification. The first 75 files ran copy-only. The
same checkpoint was then resumed in `copy-and-link-dev` mode, linking each
verified file immediately. It was gracefully stopped at **118/836** to adopt
the sequential queue. The 5 new files completed and linked, then the original
batch resumed with the same checkpoint. Inspect both checkpoints for live counts.

Preferred resume command for the entire current scope:

```bash
pnpm exec tsx tools/audio-r2/src/start-local-job.ts \
  /Users/abu3la/dev/mukhtalif/backups/audio-r2/2026-09-04/NEW-UNUSED-LOG.log \
  --queue /Users/abu3la/dev/mukhtalif/backups/audio-r2/2026-09-04/archive-queue.json \
  --r2-env /Users/abu3la/.config/mukhtalif/secrets/r2-archive.env \
  --link-env /Users/abu3la/.config/mukhtalif/secrets/supabase-development.env
```

Single-batch command (only when intentionally resuming the original batch alone):

```bash
pnpm exec tsx tools/audio-r2/src/start-local-job.ts \
  /Users/abu3la/dev/mukhtalif/backups/audio-r2/2026-09-04/NEW-UNUSED-LOG.log \
  --report /Users/abu3la/dev/mukhtalif/backups/wordpress/2026-09-02/audio-r2-dry-run.json \
  --confirm-report-sha 717cad20c3e28aca248fb7eebd9f3e16d45d44049685dc6351c5f6c4bbaa175f \
  --checkpoint /Users/abu3la/dev/mukhtalif/backups/audio-r2/2026-09-04/checkpoint.json \
  --r2-env /Users/abu3la/.config/mukhtalif/secrets/r2-archive.env \
  --link-env /Users/abu3la/.config/mukhtalif/secrets/supabase-development.env
```

Do **not** start a second process while the lock owner is alive. A graceful
SIGTERM finishes the current file, checkpoints, and releases the lock. After
an OS crash, verify the PID is dead and no matching job runs before removing
only the stale lock. Resume with the same checkpoint and a new unique log.
No auto-launch on reboot or scheduled monitor is installed.

The process uses `caffeinate -i` for its lifetime, not an OS preference change.
Keep the Mac powered and connected; locking the screen does not stop this
CLI job, but closing the lid, restarting, or losing connectivity can interrupt it.
The SDK retries S3 requests up to five times. Other exhausted failures stop
the job with the checkpoint retained; do not claim it automatically recovers
after every kind of outage.

## Safety and completion definition

1. One temporary audio file at a time, largest about 640 MB, plus a 2 GiB reserve.
2. Pin public HTTPS source DNS and validate redirects, HEAD size/MIME, GET size,
   MP3/M4A magic bytes (or an exact hash-pinned AAC review below), and source SHA-256.
3. Persist multipart upload ID and acknowledged 16 MiB parts. Reconcile R2 parts
   after interruption. Never overwrite a conflicting object; publish with
   `If-None-Match: *`.
4. Read every newly completed R2 object back directly and compare every byte's
   SHA-256 and length. Only then persist `verifiedAt` and delete the exact temp file.
5. `audio_key` linking requires matching episode ID, show, RSS GUID, original
   `audio_url` and `source_url`, and an empty or already-correct key. Preserve
   all Studio conflicts. The source URLs remain intact for rollback.
6. Completion requires **841 verified and linked across both checkpoints**, zero unresolved failures,
   current object/row counts, and MP3/M4A/reviewed-AAC streaming tests (including HTTP 206
   range responses). Keep all 841 source URLs and source bytes recoverable.

### Read-only full-scope audit

The current two-batch queue SHA-256 is
`c03fb812aa5bbb26a2b08d74de309da3772e7ada0e0594256c41a4070d4899cf`.
Do not reuse this checksum or the counts if an explicitly reviewed RSS addition
changes the queue. Run this while the job is active for a snapshot, then again
after both batches complete with a new output filename:

```bash
pnpm exec tsx tools/audio-r2/src/audit.ts \
  /Users/abu3la/dev/mukhtalif/backups/audio-r2/2026-09-04/archive-queue.json \
  c03fb812aa5bbb26a2b08d74de309da3772e7ada0e0594256c41a4070d4899cf \
  841 147815155740 \
  /Users/abu3la/.config/mukhtalif/secrets/r2-archive.env \
  /Users/abu3la/.config/mukhtalif/secrets/supabase-development.env \
  /Users/abu3la/dev/mukhtalif/backups/audio-r2/2026-09-04/NEW-UNUSED-scope-audit.json
```

The command never mutates provider data, checkpoints or live jobs. It checks
all development source identities and the current R2 HEAD proof for every
verified item. Exit 2 means the report is incomplete, not necessarily a transfer
error; inspect `failedObservations` and the detailed report. Exit 0 requires
the exact full count/bytes, both completed batches, all readback/link proofs,
unchanged current objects, and matching database keys. It is not UI/content
acceptance or a new download of all previously verified bytes.

`scope-audit-20260905-pass1.json` checked the full 841-file plan on September 4,
23:00 UTC: all **841** original source identities were preserved; the **334**
verified and linked files in its snapshot all passed current R2 and database
checks, with zero failed observations. The scope correctly remained incomplete.
A following checkpoint read at 23:00:53 UTC recorded **335 verified and linked**,
55,026,196,239 bytes, original batch still running, no checkpoint error. Read the
live state for newer counts; these numbers are timestamped evidence only.

The post-M4A-deployment `scope-audit-20260905-pass2.json` confirmed **376**
verified/linked object-key pairs, unchanged R2 metadata, all **841** original
source identities preserved, and zero failed observations. The queue was still
running, so `scopeComplete` remained false and exit 2 was expected. In particular,
the API MIME correction did not require replacing any archived R2 objects.

### Mid-frame MP3 recovery

At September 4, 23:18 UTC the original supervisor exited with `IntegrityError`
on `ep-rss-scenario-e30138cad43d73a3` (Joker 2), after **394 verified/linked**
across the two batches. This was a confirmed stopped process, not a timeout.
The downloaded file had the exact reviewed 88,350,242 bytes, but its first
complete MP3 frame begins at byte 354, outside the old 32-byte prefix check.

`mp3-sync-source-review.json` records the retained original download SHA-256
`0df74c1444c9550c4afae45f8a602697ae1c2b631ec9483799b948d66275f6c4`, its prefix,
and frame positions 354/930/1506/2082. `ffprobe` identifies MP3, stereo 48 kHz,
3681.245333 seconds versus the RSS's rounded 3681. A full `ffmpeg -xerror`
decode to a null sink exited 0. No trimming, transcoding or source replacement
is justified: the original bytes are retained.

The local transfer validator now examines at most 16 KiB. When byte zero is
not a recognized audio header, its narrow MP3 fallback requires the first frame
within 4096 bytes, three complete consecutive Layer III frames at calculated
offsets, consistent MPEG version/sample rate/channel count, and valid bitrate/
sample-rate fields. It rejects obvious text-error wrappers and arbitrary sync
words. Variable bitrate and padding are accounted for. Frame-size interpretation
was checked against the [FFmpeg decoder](https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/mpegaudiodecheader.c).
The source HEAD/size checks, full-file hash, create-only R2 upload, full R2
readback and development CAS guards remain unchanged.

The original stopped checkpoint was backed up as
`checkpoint-before-mp3-sync-fix.json`. After checking the old process was gone
and both locks absent, the **same** queue and checkpoints were resumed under
`transfer-resume-mp3-20260905.log` / supervisor `6292`.
`mp3-sync-recovery-start.json` records the evidence and startup. Resume rechecks
already completed R2 objects and development links before reaching new files;
repeated `Verified 389/836` log lines are those checks, not duplicated uploads.
Do not count this episode recovered until its live checkpoint carries the
expected hash and both `verifiedAt` / `linkedAt`, and delivery is retested.

Recovery is now confirmed by `mp3-sync-recovery-result.json`: the same original
88,350,242 bytes and SHA-256 above were fully read back from R2 and linked in
development. Current R2 HEAD metadata/ETag matched, original URLs/GUID/show and
the reviewed `TsQYW5oNWSs` link were preserved, and first/last 1024-byte public
API ranges returned 206 and matched direct R2 reads. A live process check at
23:29 UTC confirmed supervisor `6292` had moved past the episode to Seera, with
**402 verified and linked** across both batches and no checkpoint error. Add
this mid-frame MP3 case to the pending real-browser playback acceptance; HTTP
range success is not a claim that every browser decoder was tested.

The expanded archive suite passed **60 tests**, including MPEG-1/2/2.5, VBR,
padding, truncated/invalid frames, the search bound, and HTML/JSON rejection.
Tool type-check and scoped lint passed. This is a local migration-tool change,
not another API/Studio/Web deployment.

The Studio suite now passes **430 tests**. Five added DOM interaction tests
exercise normalized YouTube save, explicit clear/preview removal, rejection of
lookalike-host URLs, retry without losing the chosen link after a save failure,
and read-only operator access. They assert no audio file is sent and preserve
the publication status. These are local component/context tests, not a live
Supabase save/clear or a completed visual/browser acceptance. No Studio UI code
or deployment changed for these tests.

## Mislabeled AAC source and second recovery

At September 5, 03:01 UTC supervisor `6292` genuinely stopped at **813 verified
and linked /841**, with both locks released. Episode
`ep-rss-petroly-cb77233f92442c04` (ملوك المملكة في البترول مع د.سامر الحماد)
is declared MP3/audio-mpeg by RSS and its source HTTP header, but the exact
74,462,866 downloaded bytes are MPEG-2 AAC-LC, ADTS, 44.1 kHz stereo.
`aac-source-format-review.json` records a full successful `ffmpeg -xerror`
decode and a complete ADTS-frame walk through every byte. SHA-256:
`7c477a95de5dae96df567afa7dbac1cdf55ac1130f214a3e564212de1992e378`.
The original is retained by a hard link ending `.reviewed-aac-original`, and
`checkpoint-before-aac-format-review.json` preserves the stopped checkpoint.

`reviewed-audio-formats.ts` initially recorded this explicit exception. It pins the
episode/show/GUID, source-URL hash, original key, declared type/extension,
byte size and full body hash. Validation requires three complete frames with
the reviewed ADTS parameters and the exact full hash. Unreviewed AAC disguised
as MP3 is still refused; do not add a generic magic-byte bypass. Source URLs,
the original `.mp3` key and all RSS/episode metadata remain unchanged.
Only the initial R2 object's delivery Content-Type is `audio/aac`, with the
declared `audio/mpeg` retained as `source-content-type` and the review ID in
`format-review` metadata. There is no transcoding or replacement of an object.

Transfer and full-scope audit both use the reviewed expected object type and
metadata, including on resume and full R2 readback. **The final public delivery
audit must use this reviewed type, not infer MP3 from the key's extension.**
The existing API already supports `audio/aac`; no API/Studio/Web deployment was
needed. Its added delivery test proves full and ranged AAC responses with a
retained `.mp3` key. IANA registers [audio/aac](https://www.iana.org/assignments/media-types/audio/aac)
for ADTS; frame layout was checked against FFmpeg's `adts_header.c`.

After the change, **66 archive tests and 470 API tests** passed, along with
archive/API type checks, scoped lint, formatting and `git diff --check`.
A dry run over the actual file exercised transfer validation and captured the
correct multipart metadata using a mock client, stopping before any provider
write. It is not a real R2 success receipt. At 03:11:47 UTC the old process was
confirmed absent, both locks were absent, and the same queue/checkpoints were
resumed under `30193` / `transfer-resume-aac-20260905.log`. At 03:12:59 it was
live and rechecking the 813 previously completed files with no checkpoint error.
That initial file subsequently passed full R2 readback at 03:17:32 and development
linking, but supervisor `30193` stopped at 03:18 UTC on a second AAC source, with
**816 verified and linked**. `pending-source-prefix-audit-20260905.json` checked
all 28 remaining-at-the-813-snapshot sources and identified precisely two additional
ADTS AAC files; the other 25 passed normal format checks. Prefix checks alone did
not authorize either exception. Independent full source streams, full-file hashes,
complete ADTS-frame walks and `ffmpeg -xerror` null-sink decodes all passed for:

| Episode | Original bytes | SHA-256 |
| --- | ---: | --- |
| `ep-rss-petroly-02072a974bcadced` | 58,049,516 | `9d361ef3c69f2e6398abb88d802f6506f485aa9636d34ee36c67097a197a914a` |
| `ep-rss-petroly-e96554e2d323eb78` | 59,261,040 | `8e37f6f55addb0f94452b1cf91fef415db4ac9a2381d0c3eb408604df4486cf5` |

The private `<episode-id>-aac-source-review.json` files retain the evidence.
The second failed download matched its independent stream hash and was retained
as a `.reviewed-aac-original` hard link. `checkpoint-before-expanded-aac-reviews.json`
preserves the stopped 816-file checkpoint. No source duration, original URL/key,
or database metadata was altered. After **68 archive tests**, type-check, scoped
lint and formatting passed, both locks and the stopped process were checked absent.
The same queue/checkpoints resumed at 03:23:14 under `31453` with
`transfer-resume-aac-reviewed-20260905.log`. The two additional AAC files passed
full R2 readback and development linking at 03:28 and 03:29 respectively.

At 03:33:33 the final source passed full R2 readback; by 03:33:56 both checkpoints
reported **complete**, with **841 verified and linked** and no retained error.
The subsequent completed-copy verification above now proves current metadata,
development linking/source preservation and both public byte ranges for all
three AAC files. `archive-verification-handoff-20260905.json` records those exact
episode proofs and pins the audit receipts. Add all three ADTS files to real-browser
playback acceptance alongside the mid-frame Joker MP3; neither a decoder unit test
nor HTTP success proves that.

## September 5 RSS additions

`rss-audit.ts` fetches only the 16 reviewed Anchor feeds into a new private
directory. It never connects to a database. Evidence is under
`rss-audit-20260905/` beside the active checkpoints.

`rss-additions.ts` is an explicit, development-pinned, append-only command. It
validates manifest hashes and show identities, HEAD-checks every added audio
source, saves a full before-image, and uses plain INSERT (not upsert). It
preserves all existing rows and refuses a duplicate ID or GUID. The five rows
use the existing RSS importer's canonical row mapping. This narrow append does
not reconcile existing source metadata or the `legacy_import_records` ledger;
its provenance and rollback evidence are in the private before-image/report.

- New transfer plan: `rss-audit-20260905/additions-plan.json`.
- Plan SHA-256: `d45408cfd956e68e70268d3cac5212047465c4f9ffab8d9a8f109fab8a594da7`.
- Current RSS manifest SHA-256:
  `2985fd5f8b60e286470896b7a81f8c57a93e47898ade51422a9d401b90f7ed91`.
- Development inventory increased from 845 to **850** rows. No production writes.

Do not delete R2 objects or source files for rollback. A reviewed rollback
clears only the matching `audio_key` via CAS using the saved before-image;
the existing API then redirects to the retained original audio URL.

## YouTube and UI

- The main publisher channel is `UC8vdjzu_0QMQlG9qNT5D_AQ`. Discovery found the
  archive distributed across six reviewed sources. No video files are copied to R2.
- `youtube-inventory.ts`, `youtube-enrich.ts`, `youtube-combine.ts`, and
  `youtube-match.ts` preserve official title, description, duration and channel
  evidence outside Git. Uncertain matches stay unassigned, never guessed.
- `youtube-apply.ts` requires the report checksum, reproduces decisions from
  source hashes, backs up rows, and uses development-only CAS for the nullable
  `youtube_video_id` field. It preserves existing Studio choices and premium rows.
- Migration `0023_episode_youtube.sql` applied successfully on development only
  using Supabase SQL Editor, after the 845-row full before-image. Production
  migration remains pending a separately approved release.
- First pass linked 403 exact title/duration matches. Second pass added 265
  exact description/duration matches: 668 linked, no conflicts. See later
  pass reports for newer totals; these initial numbers are not a completion claim.
- Earlier union report `matches-v6-union.json` recorded **732** matches
  against `rss-archive-union.json` and `channel-enriched-all.json` (847 public
  videos with full metadata). Report SHA-256:
  `6a9f91ebecca35a6fd03b37de466d890f5ff032cb1a0655ffbc239daf1617573`.
- `development-apply-pass5.json` recorded 4 added, 728 unchanged, zero conflicts.
  Together with two manually reviewed links, that historical pass had 734 links.
  The expanded channel and manual-review passes now have **831 links and 831
  distinct video IDs**. **10 archive rows remain unresolved**;
  this is not a claim that every episode has a public matching video.
- Review artifact: `manual-review-and-unmatched.json`. The gilaf episode
  `ep-rss-gilaf-8ca1a1858d91e3db` was mistakenly linked by the earlier generic
  description-prefix matcher. Its importer-owned value `FpGh_eE_dU0` was replaced
  with the verified `KGBr_pwxeBE` via exact CAS, preserving both before/after
  images. The old video features a different guest/book. Repeated program
  introductions are now rejected, and regression tests cover this failure.
- The Bandar Al-Maarik real-estate episode retains `JG9L9DyleGE` after manual
  title/guest/description/duration verification. RSS erroneously copies its
  description onto an unrelated Ali Al-Bahrani episode; do not reuse that
  description as evidence for the unrelated row or edit source content silently.
- Promotional-title filtering distinguishes a real trailer label from a full
  discussion about advertising. Exact titles still require verified public
  official-channel metadata and compatible duration. Never weaken these gates
  to inflate coverage.
- Web uses `youtube-nocookie.com` only after a deliberate watch click. Starting
  video pauses audio; starting audio unloads the video. Premium public projections
  omit the video ID. Card thumbnails come from the actual YouTube ID.
- Studio provides a validated YouTube field and preview; null removes the link.

### Expanded publisher and manual-review evidence

`youtube-channels.ts` pins these source-specific grants. Similar channel names,
search results and caller-provided IDs do not authorize arbitrary sources.

| Source | Channel ID | Permitted archive series |
| --- | --- | --- |
| إذاعة مختلف | `UC8vdjzu_0QMQlG9qNT5D_AQ` | Existing archive series |
| جنائي مختلف | `UCbbF1sfUu2LV2vCads1eqiw` | `qadiyah` |
| ريادي مختلف | `UCfzOXNx3P7hiaJqCXrm9xmA` | `seera`, `bokra` |
| مسرح مختلف | `UC2_XJBPAErN7jrKwp2DD04A` | `arwiqah` |
| برامج مختلف | `UCsStokacx6kw8vuMuRBElqw` | `seera`, `qadiyah` |
| KFUPM Media Club | `UCyX-aDx9h-_pOnwYF66WYUw` | `petroly`, RSS dates before 2022 |

The original-producer attribution for KFUPM is explicit in Petroly RSS and
YouTube descriptions. It is not a domain/account ownership claim. Evidence is
saved as `jinai-channel-review.json` and `publisher-channels-review.json`, plus
full metadata for all 1,191 public videos in the six channel snapshots.

- Qadiyah pass added 49 links; Riyadi 5; Stage 1; Programs 3. Programs also found
  two alternative uploads whose existing Jinai links were preserved, not replaced.
- KFUPM automatic passes added 11 original episodes. Curated reviews cover short
  titles, changed titles, names, dates and exact durations, with private source
  hashes and a recorded rationale. `youtube-reviewed.ts` retains the 2-second
  duration / 4-day publication gates. Explicit title reviews do not relax the
  automatic title matcher; Arabic compound-name spacing is normalized.
- Automatic description evidence still requires 45 words, at least 25 distinct
  words and 180 characters, a unique non-repeated excerpt, compatible duration,
  a public video and an approved source. A final complete 45-word window now
  handles a short description whose opening was rewritten. No shorter excerpt
  or fuzzy-title auto-linking was enabled.
- Current main report: `matches-v7-main.json`, SHA-256
  `ec8691fe803505644a8b23f45ff9264961c85de1c988b52639a85e45d5f2c4dc`.
- Current KFUPM report: `kfupm-matches-pass2.json`, SHA-256
  `96237ec65ee0704b14bc3cc5ff6d6ce25d0bc297ab649b00d56641f3f66b0a58`.
- Do not edit or reapply historical reports blindly. Matching logic has evolved;
  regenerate a fresh report from the preserved source snapshots and inspect it.
- `development-coverage-audit-pass1.json` at 2026-09-04 21:58 UTC confirms 850 DB
  rows, 841 archive rows, 826 unique links, 15 unresolved, no missing rows, no
  changes to RSS identity/title/duration/source URLs, and no invalid video sources.
  `manual-review-and-unmatched.json` predates these passes and is historical.
- `unresolved-reviewed-pass1.json` explains every remaining row: 12 have a
  candidate requiring content/edition verification; 3 have no verified public
  candidate after the recorded searches. Do not call all 15 unavailable or
  inflate coverage by treating date/duration coincidence as identity proof.
- Large audio/video duration differences remain unlinked pending content-level
  verification. Direct source probes confirmed the declared audio durations for
  the Amazon, Working Identity and anesthesia cases; do not assume RSS duration
  is wrong or silently change it to force a video match.

### Spoken-content review and upstream exceptions

The earlier audit `development-coverage-audit-pass2.json` (September 4,
22:22 UTC): 850 development rows, 841 archive episodes, **827 unique video IDs**,
14 unresolved, and zero missing rows, source-identity drift or invalid sources.
The pass-1 audit and unresolved report above are retained historical evidence.

- `ep-rss-petroly-ea34425d5652077f` now links to `_u-D9M0rQUo`. Although its
  RSS title and generic footer do not identify the video, two local speech
  transcripts at 90–180 and 1080–1170 seconds match the same particular
  conversation and timing in the public YouTube Arabic captions. Both editions
  are 4837 seconds and were published January 23, 2025.
- Review: `main-spoken-content-review-pass1.json`, SHA-256
  `c604b29d760b35287d0dcdb553c8bb37a865d8e889f453c2310cb4e19928b739`.
  Apply: `development-spoken-content-apply-pass1.json`, one linked, no conflict,
  full before-image retained. Only `youtube_video_id` changed on development.
  Subsequent development API and Web episode requests both returned HTTP 200
  and contained the verified video ID. This is not a substitute for browser QA.
- `youtube-content-reviewed.ts` is manual-only. It pins RSS/channel/audio-report,
  local clip and caption hashes; requires two separated 60–90-second windows
  with unique shared passages; and keeps the 2-second duration/4-day date gates.
  Source URLs are additionally guarded by the database compare-and-set.
  Never use the machine transcript alone as editorial identity proof.
- `review-clip.ts` uses the already installed local Whisper `small.pt` model and
  Python, at two CPU threads and low process priority. It streams at most 90
  seconds of decoded source audio through memory and saves only private text
  evidence. It does not download models, write extra audio files, or send audio
  to a hosted transcription API. Public YouTube captions are text only.
- `unresolved-reviewed-pass2.json` now records **9 content-review candidates,
  3 with no verified public candidate, and 2 upstream source problems**:
  - Amazon `ep-rss-awalim-c786afbefe4c9a6c`: the 6795-second RSS enclosure
    introduces Filmrent with Dr. Musfer Al-Mousa and discusses cinema, matching
    the opening of `DCVE8CQVVdE`, not the traveler episode named in RSS. The
    intended Amazon video `akVtruNDtuM` has a different guest/topic and 4315
    seconds. Actual source transcripts and both caption tracks are retained.
  - Manar `ep-rss-imkan-4d061463190fa931`: the entire 44-second enclosure
    matches the opening teaser of `gt5U3_4Z0YI`; the full interview runs 2574
    seconds. RSS labels it full, but the source does not contain that interview.
  Both source files/URLs/metadata remain unchanged and neither row is linked to
  a misleading full-video substitute. Resolving upstream source content requires
  locating an authorized correct audio source, not altering a checksum or guessing.

### Verified recording editions and current exceptions

`development-coverage-audit-pass3.json` at September 4, 22:44 UTC is current:
850 development rows, 841 archive episodes, **831 unique YouTube links**, 10
unlinked, no missing rows, no source-identity drift and no invalid video sources.

`youtube-edition-reviewed.ts` handles a different published cut of the same
recording, not a fuzzy metadata guess. A recorded editorial review binds the
actual source and caption files by SHA-256; compares 2–3 long, distant passages
in chronological order; requires the same named guest and reviewed publisher;
pins both observed publication dates and durations; and explains the difference.
The ordinary metadata and exact-duration speech matchers are unchanged. The
edition path preserves the original audio/date/duration and uses development-only
CAS with a before-image and source-URL guards. Text overlap is only an evidence
integrity check, never the editorial decision.

The four approved records and SHA-256 values are indexed in
`edition-reviews-pass1.json`. Each `edition-review-VIDEO_ID.json` has its own
`development-edition-apply-VIDEO_ID.json` and full before-image. Four links were
added, zero existing choices replaced and zero conflicts. All four development
API episode requests returned HTTP 200 with the expected IDs.
`edition-development-http-checks.json` also confirms all four Web episode pages
returned 200 with those IDs and their real thumbnail URLs returned 200/image/jpeg.
These remain HTTP checks, not completion of the pending browser acceptance.

| Episode | Video | Preserved source / video seconds | Directly compared source windows |
| --- | --- | --- | --- |
| التخدير: طبيب لكن وراء الكواليس | `DVm9lUPhEww` | 7207 / 6341 | 0–90, 3600–3690 |
| أكرم جمل الليل | `c5frfo1GJPs` | 5429 / 5422 | 0–90, 2700–2790, 5310–5400 |
| مزروع المزروع | `lhNmoYXLMiI` | 6066 / 8092 | 0–90, 3000–3090, 5950–6040 |
| فيلم الجوكر 2 | `TsQYW5oNWSs` | 3681 / 5477 | 0–90, 1800–1890, 3540–3630 |

The Joker source corresponds to the later part of the video, about 1796 seconds
after its start, and was published later. Mazroou's video is longer than the
source. These links identify the same recording, not a claim that every audio
file contains the entire video edition. No YouTube audio/video was downloaded.

`unresolved-reviewed-pass3.json` now records 10 exceptions:

- Three wrong-source enclosures: Amazon (above), Arwiqah problem-solving
  `ep-rss-arwiqah-4160718db12882f9`, and Working Identity
  `ep-rss-gilaf-97c5a6f6756f9023`. The latter two source openings actually match
  Jassim Al-Mutawa's Petroly `-hhZ-FJRR_M` and Fit for Growth with Khalid
  Al-Ahmari `8nBMTXJovZo`, respectively. Do not assign those wrong-topic videos
  to the current episode titles.
- One teaser-only source: Manar Al-Zahrani (above).
- Three real public candidates without captions: Hamza Abdulghani chemistry,
  Obaid Al-Abdali university marketing, and the historical physics episode.
  Local source introductions are preserved, but video-side content review is
  still required. `--list-subs` reports neither automatic nor uploaded captions;
  that does not mean the public videos are unavailable.
- Three with no verified matching public video: CV writing, the Al-Bilali
  addiction episode, and the Kaaba-cover craftsman. Their source openings were
  inspected; `unresolved-search-pass4.json` records further focused searches.

`source-exceptions-raw-rss-proof.json` independently checks the four suspect
enclosures against their exact raw XML `<item>`/GUID/title. All match the parsed
manifest; these are upstream source issues, not a migration-parser reassignment.

`existing-audio-alternatives-check.json` in the audio backup directory found only
the `legacy/` prefix and 311 objects, all belonging to the reviewed transfer
plans, at 22:50 UTC. No alternate source audio was found there. A scoped search
of the saved WordPress manifest also found no verified replacement files. The
user was asked for a local folder containing the correct four original files;
do not infer a replacement or discard the preserved upstream audio meanwhile.

`wordpress-live-audio-source-check.json` records a further read-only check at
September 5, 02:30 UTC of the live Arwiqah, Awalim, Gilaf and Imkan program
pages. All four returned 200; their public HTML exposes Apple Podcasts embeds,
but no audio/source tags or direct MP3/M4A links. Page URLs and HTML hashes are
retained in the private report. This found no verified replacement and does not
prove that correct originals are unavailable elsewhere. No WordPress content,
source metadata, database row or archived object was changed by this check.

`apple-source-exceptions-check-20260905.json` extends that check at 02:42 UTC
to the four exact public Apple episode pages, including the older Arwiqah
episode found through a targeted Apple-domain search. All four GUIDs and every
advertised audio enclosure URL exactly match the preserved, hash-pinned RSS
plan. Apple reports the same durations: 8704, 6795, 6390 and 44 seconds for
Arwiqah, Awalim, Gilaf and Imkan respectively. Thus these Apple offers provide
no alternate audio for the four documented defects. The private report pins
the queue, page URLs and HTML hashes; only selected public episode metadata
is retained, not session tokens. No audio was downloaded and no provider data
changed. This is independent metadata corroboration, not another content decode.

The read-only `integrity-audit-20260905-pass1.json` in the audio backup directory
checked all 269 files verified at its September 4, 22:30 UTC snapshot: current
R2 size, ETag, SHA-256/source-hash metadata and MIME all matched, and development
keys plus original URLs all matched. Zero failures. This confirms those 269
objects still match the prior full read-back proof; it is **not** a fresh full
body download or a claim that all 841 files completed. Continue checking the
live process and both checkpoints, then perform the all-scope final audit.

Development API version: `bae5c8c6-f3bc-4b5f-9c4d-ee388313792b`.
Previous API version `90890834-cf7a-4522-b340-425cf2cf1971` remains in provider
deployment history for rollback; it predates the M4A delivery-header repair below.
Latest Studio version: `c451e91e-6ef2-4ceb-a2bc-004e1862f4ee`.
Latest Web version: `306c2cf8-ab10-4609-8c66-72d51f0dc869`.
Earlier Studio/Web versions are retained in provider deployment history.

Verification on September 5: API 466 tests, Studio 425, Web 67, archive tools 41,
RSS tools 6, deployment scripts 5 (**1010 passing tests**). The archive suite was
rerun after the recording-edition evidence guards. Repository type-check,
lint, tool type-check/lint and scoped formatting passed. Live API root and new
episode GET returned 200, unauthenticated `/studio/me` returned 401, and the new
Munawib audio returned HTTP 206 with exactly 1024 bytes and no source redirect.
Cloudflare `/health/live` is not defined; that is the Hostinger Node adapter's
endpoint, not the Worker health route.

The later read-only audit addition passed **54 archive tests** (13 additional
audit cases), tool type-check and scoped ESLint. The earlier API/Studio/Web/RSS/
deployment results above are retained; they were not re-run for this tools-only
change. The current Mac check still reports a locked device, so Supabase login
alone has not unblocked browser acceptance.

The newer `local-regression-verification-20260905.json` records the September 5,
02:45-02:47 UTC local verification of the current `dev` worktree: **469 API,
430 Studio, 67 Web, 66 archive/RSS, and 5 deployment-script tests**, all passing
(1037 total). All 22 workspace type/lint tasks were forced and passed without
cache reuse. Separate archive/RSS type checks and scoped tool/helper lint also
passed, as did `git diff --check`. The API Node bundle built successfully with
`--target=node22`; the tests themselves ran under local Node **26.3.0**.
No Hostinger/Cloudflare deployment or provider mutation was performed by these
verification commands; the existing transfer continued independently.

The receipt includes commands, exit codes, test summaries and a **post-test**
542-file source manifest with SHA-256
`aefc03aa4207cd2e811f27ccaee0eb0cf33900c2dcd3267239cca999e8697209`.
This is not an atomic before-and-after source snapshot, a full-scope R2/DB audit,
or real-browser acceptance. In particular, the locked Mac still prevents the
pending live Studio save/clear and final playback/layout checks.

### Live transport audit and M4A repair

`development-delivery-audit-20260905-pass1.json` checked all 344 verified and
linked episodes selected at September 4, 23:03 UTC. For each, the probe requested
the first and last 1024 bytes from the development API with redirects disabled,
validated status/range/security headers, and compared delivered bytes with direct
private R2 range reads. **339 passed; five M4A cases failed the MIME check.**
The failed responses were 206 with correct lengths but `audio/mpeg` instead of an
M4A-compatible type. Preserve this failed before-repair report.

Cause: the source and immutable R2 metadata use the legacy `audio/x-m4a` label;
the API's delivery allowlist did not recognize it and fell back to MP3. The
shared `safeAudioMediaContentType` now canonicalizes this known alias to
[`audio/mp4`](https://www.iana.org/assignments/media-types/audio/mp4), and maps
`audio/mp3` to `audio/mpeg`. It preserves `nosniff`, clamps unknown/dangerous
types, and does **not** expand the accepted upload types. No stored bytes,
source URL, R2 metadata, database row or production service was changed for
this repair. Two new regression checks failed before the fix and passed after;
an additional test proves legacy aliases are still refused on upload.

The guarded manual API deployment produced version
`bae5c8c6-f3bc-4b5f-9c4d-ee388313792b`. `development-m4a-repair-check-20260905.json`
at 23:11 UTC retested **all five M4A cases and two MP3 controls**: full-response
headers returned 200 and the correct MIME/size, and both 1024-byte ranges
returned 206 and matched direct R2 bytes. Zero failures. API root returned 200;
unauthenticated `/studio/me` returned 401. Full large public responses were
canceled after checking headers; only the bounded ranges were compared, not a
new full-body download. Original full-body SHA proofs remain in the checkpoints.

After the fix, all **469 API tests**, API type-check, scoped lint, and the
Node.js 22 bundle build passed. Repository-wide type-check and lint also passed
(11 configured tasks each). Building the Node bundle did not deploy Hostinger.
Studio/Web deployments were not changed in this turn. Continue the all-841
completion audit after transfer finishes; these are timestamped partial-scope
transport and regression proofs.

The incremental `development-delivery-audit-20260905-pass2.json` ran at
23:36:55–23:37:32 UTC. It pinned the complete queue and both plan checksums,
rechecked the exact 841-file/147,815,155,740-byte scope, and selected all **78**
checkpoint-verified/linked files not among the previous report's 339 passes.
This includes the five earlier M4A header failures, so they were not skipped.
All 78 passed both 1024-byte API ranges against direct private R2 range reads,
including canonical delivery MIME, exact range/length, `nosniff`, and no source
redirect. Together the two reports cover **417 distinct files**. The second
report pins the first report's hash; it does not overwrite the failure evidence.
No provider data, checkpoint, application code or deployment changed for this
read-only check. This remains partial transport evidence, not a new full-body
readback or browser-playback acceptance.

At 23:37:32 UTC the live checkpoints contained **419 verified and linked**
files. The exact supervisor `6292` command was confirmed alive, and the active
log showed continued Shaqla multipart uploads. Free disk space was 18 GiB.
The browser acceptance attempt still reported a locked Mac. Orca's read-only
permission check reported Accessibility and Screen Recording granted; no
permission reset or account-setting change was made. Unlocking the Mac remains
necessary for the real Studio save/clear and final desktop/mobile playback tests.

`checkpoint-progress-20260905-500plus.json` records the later September 5,
00:14:44 UTC milestone: **506 verified and linked files, 78,169,611,679 bytes
(72.8 GiB)**, with supervisor `6292` confirmed live on the exact queue command.
The receipt pins the queue/plan hashes and the observed checkpoint hashes and
timestamps. Both scope totals remain 841 files / 147,815,155,740 bytes. The
transfer has progressed from Shaqla to Petroly; no restart or source/provider
configuration change was made. Disk inspection shortly before this snapshot
still showed 18 GiB free. This is checkpoint/process evidence only, not another
R2/DB integrity audit, full-body readback or completed browser acceptance.

`checkpoint-progress-20260905-750plus.json` records **754 verified and linked**,
133,853,440,330 bytes (124.66 GiB), at September 5, 02:30:53 UTC. The exact
supervisor `6292` was still live, queue/plan checksums were unchanged, and both
checkpoints had no error. The remaining planned bytes were 13,961,715,410.
This is another checkpoint/process receipt, not the final provider audit.
A separate development-only GET at 02:30 UTC returned 850 episode rows and
831 YouTube links. Chrome's window title identifies Mukhtalif-Dev, but the
current browser-control attempt still reported a locked Mac; live Studio and
final playback/layout acceptance remain pending. A logged-in Supabase browser
session does not by itself prove that the desktop is available for UI tests.

### Live YouTube metadata and thumbnail coverage

`public-embed-thumbnail-audit-20260905-pass1.json`, completed at 23:07 UTC, first
verified the six source-snapshot hashes and live development inventory: 850 rows,
831 linked public non-premium episodes matching the reviewed IDs. All **831**
live YouTube oEmbed requests returned the expected video iframe identity, and
all **831** actual `hqdefault.jpg` card-thumbnail HEAD requests returned 200,
`image/jpeg`, and a positive content length. Zero failures. No video/audio media
or browser cookies were downloaded. The three public candidates and four
upstream audio issues remain unresolved as documented above.

Do not equate oEmbed/thumbnail availability with actual playback acceptance.
YouTube documents separate embedded-player restrictions and errors in its
[IFrame API reference](https://developers.google.com/youtube/iframe_api_reference).
The final browser checks still require an unlocked Mac and must run within the
real episode page, including its referrer context, not by opening an embed URL
alone. No account, channel or embedding-permission setting was modified.

After the expanded links, live development API GETs for Qadiyah, Seera and
historical Petroly returned HTTP 200 with their expected video IDs. The Qadiyah
Web episode HTML also returned 200 with the new ID. All three corresponding
`hqdefault.jpg` thumbnail HEAD requests returned 200 and `image/jpeg`. These are
HTTP/data checks, not substitutes for the still-pending real browser interactions.

Verified in Chrome: actual R2 audio playback, embedded YouTube video playback,
both directions of audio/video exclusion, 390px mobile viewport without overflow.
Further visual checks and Studio save/clear remain pending if the Mac is locked.
Opening the draft form did not create a row; do not claim a live save test passed.
The final static UI review preserved the existing brand/type system, removed
title clipping and kept content visible by default. Keyboard focus uses dark ink
against the white surface, not the white button-label color. New controls have
real handlers; no decorative animation, gradients, generic logo tiles or fonts
were added. Final post-deploy desktop/mobile layout and Studio save/clear checks
remain blocked by the locked Mac; do not mark the visual acceptance complete.

## Guarded manual development deployment

Local `.env.local` / `.env.production` files can still contain old production
origins. Do not trust or blindly source them. The Studio helper validates the
private dev anon key and rejects production origins or service keys in output.

```bash
pnpm --filter @mukhtalif/api deploy:development
pnpm --filter @mukhtalif/admin deploy:development --env /private/studio-development.env
node scripts/assert-cloudflare-development.mjs
pnpm --filter @mukhtalif/web run deploy
```

`pnpm run deploy` is intentional: `pnpm deploy` is pnpm's unrelated workspace
deployment command. Web's build script pins the two development URLs from
Wrangler and strips monorepo dotenv fallbacks. No automatic deployment is enabled.
