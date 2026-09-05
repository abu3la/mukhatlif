# Direct episode video: development release

User-requested layout: `الاستماع للحلقة` above audio and `مشاهدة الحلقة` above a
YouTube iframe already present in server-rendered HTML. No reveal toggle and no
site-owned external YouTube watch link. YouTube's own controls/branding remain.
The iframe uses the site's `--radius-card` token (currently 14px), matching the
other media/card surfaces without adding an overlay over YouTube controls.
No autoplay. Missing/invalid video IDs render no video section; premium video
gating remains unchanged.

The official YouTube IFrame API coordinates playing/pausing while the iframe is
rendered independently of script readiness. Starting audio pauses video; playing
video pauses audio. Starting audio does not hide the embed. The SDK manages an
opaque subtree, with cleanup for route changes/Strict Mode. A blocked SDK does
not remove the visible iframe; cross-player coordination depends on SDK loading.

Reference: https://developers.google.com/youtube/iframe_api_reference

Verification on 2026-09-05:

- 69 Web tests pass, including immediate server-rendered iframe, headings, no
  reveal toggle, no autoplay, no external custom watch link, invalid ID exclusion.
- TypeScript/ESLint and Cloudflare build pass.
- Real Chrome page: `/episodes/ep-rss-munawib-57e11177004da3ce` on development.
  Embed visible on first visit before any button click; actual YouTube controls
  loaded. Video played from its own play control.
- Audio started: native audio `paused=false`, time 39.77; video `paused=true`,
  time 10.73. Video then played: audio `paused=true`, time 54.23;
  video `paused=false`, time 21.00. Both were paused after testing.
- Desktop visual review kept current brand type/color and aligned full-width
  audio/video sections. Added 32px spacing above the audio section after spotting
  its heading too close to the episode title. No new decorative controls, fonts,
  gradients, shadows or content-hiding animations. Frame stays responsive with
  a 200px minimum height for YouTube's controls.
- 390x844 Chrome view: video/heading fit inside the page gutters, with usable
  controls and no horizontal overflow. Viewport override was reset after testing.
- Final Web Worker version: `56e583da-63bd-43ca-bc38-3158313bf782`.
- Radius follow-up: all 69 Web tests and the deployment build passed; Chrome screenshots confirmed all four rounded corners with the native controls unobstructed.

Only the development Web Worker is released. No API, Studio, database, original
audio, video identifiers, production Hostinger, DNS or Git publication changes.
