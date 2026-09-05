# Studio audio upload: development handoff, 2026-09-05

## Current behavior

- Choosing a file does not upload it. **رفع الملف** is the only audio action.
- Save handles episode metadata and status only. With a pending selection it stays
  in the editor and explicitly says the file has not been uploaded. A new publish
  or scheduling transition requires uploading or clearing that selection first.
- A first upload creates a draft with the entered metadata, retains its ID even
  if upload fails, and never publishes it. Uploading to an existing episode does
  not save unsaved metadata or change publication status.
- Real XHR byte progress, confirmed-part bytes, pause, resume, cancel and retry
  live inside the audio area. Completion is distinct from transmitting 100%.
- Resume keeps completed 16 MiB parts while this page remains open. Closing or
  reloading the page is not a supported resume path; navigation/close warnings
  protect active transfers. This is not cross-device/background upload support.
- Arabic labels follow ux-araby: concise states, explicit actions, no success
  claim before server confirmation. Empty, ready, preparing, progress, paused,
  network error, verification, cancelling, cancelled, failed and completed states
  are handled. The composite audio section no longer nests buttons in a label.

## Storage and authorization

The authenticated `/studio/episodes/:id/audio-uploads` API requires
`episodes.manage`. Reservations are bound to the authenticated actor and episode;
control records in private R2 are namespaced by the Supabase hostname. Chunks are
size-bounded and SHA-256 checked. Final size/MIME verification precedes a database
compare-and-set against the previous audio key. New uploads use unique keys, so
cancellation never overwrites/deletes the old audio. Cancellation/finalization
use conditional storage writes. Completion can reconcile a lost response.

Native R2 and the Hostinger S3 adapter implement the same multipart contract.
Only Cloudflare development is deployed. No migration, public bucket, new key,
DNS, production data/Auth, Hostinger, newsletter or Git publication changes.
Control receipts/tombstones remain private; cancellation aborts unfinished
provider parts. Reservations expire after 24 hours. No bucket lifecycle change
was made and automatic control-record cleanup is not implemented.

## Verified

- API: 489 passing tests across 33 files; Studio: 445 across 42 files.
- Both TypeScript and ESLint pass; Node 22-targeted API bundle builds. Execution
  of that bundle under a Node 22 runtime was not tested in this local Node 26 run.
- Tests cover pause/resume, immediate pause/resume race, network retry,
  cancellation retry, uncertain completion, permanent conflict, draft-ID reuse,
  auth/ownership/permissions, checksums, CAS and separation of Save from Upload.
- Studio's guarded build pins the development API/Supabase/anon key and rejects
  production origins or a service key in the browser bundle.
- Empty upload area reviewed in Chrome at desktop and 390x844 mobile: current
  Studio palette/type preserved, contained RTL layout, readable copy and gutters.
- Design-law re-check: no added fonts, decorative hero/cards/logos/gradients,
  glow/shadows, hover lift, entrance-hidden content or icon tiles. Native progress
  has stable rounded caps and does not clip text. Controls wrap, filename wraps,
  42px targets and reduced-motion behavior are present. Page-wide marketing
  composition rules are not a reason to redesign the existing Studio shell.
- Public development API `/` and `/shows`: HTTP 200. Studio serves the new build.
  Upload without auth: HTTP 401; no file or record created by that smoke check.
- `/health/live` is a Node entry-point endpoint, not defined on this existing
  Cloudflare Worker; its 404 was not treated as an upload regression or concealed.

## Remaining browser acceptance (not passed yet)

Chrome's extension rejected `fileChooser.setFiles` with `Not allowed`. No security
setting was changed. The user can select the file themselves, or enable **Allow
access to file URLs** for the ChatGPT browser extension. Subsequent attaching to
the existing development tab also returned `Debugger unattached`.

Therefore the new populated progress states and real end-to-end multipart upload
have automated coverage but are **not yet verified by a real browser upload**.
Do not report this browser gate as complete or reuse the old single-upload proof.

1. Refresh development Studio, open its development-only test draft
   `episode_ep-4a5c8823` (database ID `ep-4a5c8823`). Never publish it.
2. Select `/Users/abu3la/Desktop/Mukhtalif-audio-test.wav` (529278 bytes).
   Confirm it remains pending; Save must not upload it.
3. Click **رفع الملف**, wait for **اكتمل رفع الصوت**, confirm the new unique R2
   key is linked to the same draft and bytes match the local file. Original
   `episodes/ep-4a5c8823.wav` must remain intact.
4. Use a separate synthetic test file >16 MiB to exercise pause/resume/cancel,
   verify progress/confirmed bytes and original-key preservation. Check mobile
   populated states, keyboard focus, navigation warnings and retry buttons.
5. Record authenticated browser/R2 proof here. Do not re-run the archive transfer.

## Manual deployment receipts

- API: `8e89fcc2-a271-4bfc-833a-71486e520c14`
- Studio: `d033e1da-8122-4cee-88d5-72fc2e57477d`
- Previous Studio `bbd2bb5a-933b-4c67-8f97-864d55e95287` was immediately superseded
  to show the preparing state while creating a new draft, before upload starts.
- Web unchanged: `306c2cf8-ab10-4609-8c66-72d51f0dc869`.
- Uncommitted `dev` at `93e807f9d278`; no commit, push, merge or production release.
