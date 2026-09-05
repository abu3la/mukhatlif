# Development archive browser acceptance: September 5, 2026

Scope: existing manual development deployment only. This supplements the
complete-copy, full-object integrity and all-841 public-range receipts in
[the active runbook](AUDIO_R2_ACTIVE_RUN.md). It does not authorize production,
Hostinger, DNS, a main merge, or replacement of editorially disputed originals.

The user explicitly deferred the ten source/video exceptions to
[their Notion review task](https://app.notion.com/p/3d2ab5ab63da815cb475c2f4ec2a528b?pvs=204).
All ten audio files are already among the 841 copied files. The review Markdown
is retained in the repository and attached to that task; none of the candidate
video IDs was approved or written by this deferral.

## Actual Chrome playback

Each row below was opened on `web.mukhtalif-development.workers.dev`, started
through its real audio control, and observed playing from the development API
with `readyState = 4`, `paused = false`, and no media error. These observations
prove browser decoding/playback, not that the entire episode was listened to.

| Episode ID | Observed elapsed seconds | Browser duration seconds |
| --- | ---: | ---: |
| `ep-rss-petroly-cb77233f92442c04` | 31.914744 | 4653.929125 |
| `ep-rss-petroly-02072a974bcadced` | 62.886258 | 3598.184839 |
| `ep-rss-petroly-e96554e2d323eb78` | 37.387367 | 3702.773595 |
| `ep-rss-scenario-e30138cad43d73a3` | 27.882962 | 3681.245333 |

The first three are the reviewed original AAC files. The fourth is the original
mid-frame Joker MP3. Bytes, source URLs and object metadata were not changed by
these browser tests. The first episode's +15-second control advanced playback.

Joker's `TsQYW5oNWSs` video played inside the actual YouTube embed. Chrome exposed
elapsed time 0:43, progressing caption text and the video pause control. Opening
the video paused the audio. Starting the audio again removed the iframe
(`frames = 0`) and resumed audio (`paused = false`, `readyState = 4`). No media
was downloaded from YouTube. Audio was paused before leaving the episode page.

## Studio save and clear: authenticated, development only

The existing account «هاشمي - تطوير» created a clearly named, unpublished test
draft through Studio, without auth bypass, a new credential or a published
episode edit:

- Studio ID: `episode_ep-12005d29`; database ID: `ep-12005d29`.
- Title: «اختبار حفظ وإزالة يوتيوب - تطوير فقط 2026-09-05».
- At `2026-09-05T08:09:24.760Z`, a direct read-only development query confirmed
  `youtube_video_id = TsQYW5oNWSs`, `status = draft`, `audio_key = null`.
- Reopening Studio showed the stored URL and its thumbnail preview. Clearing
  the field removed the preview; clicking «حفظ كمسودة» saved that change.
- At `2026-09-05T08:13:00.348Z`, a second direct read confirmed
  `youtube_video_id = null`, `status = draft`, `audio_key = null`.
- A final read at `2026-09-05T08:16:27.685Z` found 851 total development rows,
  all 841 archive source/GUID/show identities and R2 keys unchanged, exactly
  the same 831 reviewed YouTube IDs, and ten deliberately unlinked exceptions.
  The new draft's anonymous public API detail returned HTTP 404.

The one test draft remains unpublished for traceability; no original episode
was deleted or edited. The audio-upload form described below has not created
an additional database row.

## Visual and interaction review

Reviewed the actual deployed episode page, related episode rows and weekly
homepage cards at the normal 1272px viewport and a temporary 390 × 844 viewport.
The temporary viewport override was reset afterward.

- The weekly section remains immediately after the hero. Actual thumbnails are
  loaded from the reviewed YouTube IDs, not mock images or invented artwork.
- Weekly cards align at their top and bottom, including variable-length Arabic
  titles; rows retain readable titles and metadata at both widths.
- At 390px, the document width was exactly 390px. Scrolling the weekly rail
  moved its `scrollLeft` from 0 to -296, while document width stayed 390px.
  The rail itself was 358px wide with 2660px of scrollable content.
- Related-row thumbnails were fully decoded at natural width 480; visible
  weekly thumbnails also had positive natural widths. Text did not overflow
  its measured container widths. The intentional partial next card signals
  horizontal scrolling; live text inside the fully visible cards was not cut.
- Real Tab navigation reached the related-episode play control. Its focus was
  a visible 2px dark-ink outline with 3px offset, fully clear of surrounding
  clipping, on desktop and mobile.
- New video actions use a solid primary and ordinary text link, a quiet hover
  color change, visible focus, and no hover movement or entrance-hidden content.
  New thumbnail links are decorative duplicates with `tabIndex=-1` and
  `aria-hidden=true`; the separately named title is the accessible navigation.
- The affected components were rechecked against the supplied design law:
  no new fonts, logo inventions, gradients, glows, decorative floating UI,
  generic hero/footer/pricing structures, fake data, motion-gated content,
  clipped text, or off-axis controls were introduced. Existing site-wide brand
  styling was retained; this is not a claim of a full-site redesign.

## Separate follow-up: live Studio audio upload is not yet verified

The existing form provides MP3/WAV upload via the API to R2 and episode linking.
It is still a single-request upload, not a resumable multipart browser upload.
The displayed 500 MiB limit is not proof that a 500 MiB request passes every
Cloudflare/hosting limit; no large-file browser success is claimed.

An unsubmitted form is prepared in Chrome with title
«اختبار رفع الصوت من الاستوديو - تطوير فقط 2026-09-05» and a synthetic six-second
WAV fixture at:

`/private/tmp/mukhtalif-studio-audio.I8ZILF/studio-upload-check-20260905.wav`

- Fixture size: 529,278 bytes.
- SHA-256: `0d39434e701d2957c9a43e43fcc1f2740dc968714366549b055240779e465718`.
- The native file dialog could open, but automated typing/paste failed.
- The documented Chromium chooser was then obtained by clicking the visible
  «تصفح الملفات» label. `setFiles` returned `Not allowed` before selection.
- The browser documentation identifies the required extension setting as
  «Allow access to file URLs». No extension permissions were changed.

The user can select the test fixture themselves, or enable that extension
setting. Then save as draft through Studio and compare the resulting private
R2 object byte-for-byte against the fixture. Do not publish or claim upload
success merely because the file chooser opened. A read-only draft/object
verification helper and the actual save/clear receipts are beside the fixture
in the private temporary directory. No API source changes were needed for the
browser checks recorded above; existing automated regression evidence remains
the prior 1046-test pass.
