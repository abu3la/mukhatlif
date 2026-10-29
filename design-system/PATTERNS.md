# Patterns

How screens are put together. Extend the closest existing page; do not
assemble a new layout from generic sections.

## Page shell

Every route renders inside the root layout (`apps/web/src/app/layout.tsx`):
skip link, `SiteHeader`, `<main id="main" class="site-main">`, `SiteFooter`,
and the persistent `PlayerProvider` dock. A page never adds its own header,
footer or second player.

| Need                      | Use                                                                                         | Defined in                    |
| ------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------- |
| Width and side gutter     | `.content-container` (max `--measure` + 2 × gutter, inline padding `--gutter`)              | `listener.css`                |
| Narrow reading column     | `.content-container--narrow` (`--measure-episode`) or `--measure-article`                   | `listener.css`                |
| Vertical rhythm of a page | `.content-page` (`padding-block: clamp(28px, 4vw, 44px) 64px`)                              | `listener.css`                |
| Public editorial page     | `.public-page` (`padding-block: 36px 72px`)                                                 | `public-pages.css`            |
| Page title block          | `.public-page-head` (h1 + one lead paragraph, max 760px)                                    | `public-pages.css`            |
| Account page title        | `.customer-page-head`                                                                       | `customer.css`                |
| Request forms             | `RequestPage` (`.request-page`, `__header`, `__body`)                                       | `components/request-page.tsx` |
| A section inside a page   | `.content-section` with `.content-section__header`, `__title`, optional `__meta` / `__more` | `listener.css`                |

Rules:

- One `h1` per page, in the page head. Section titles are `h2`
  (`.content-section__title`).
- A page head is a title and at most one short lead line. No kicker label above
  it, no second button row.
- Sections are separated by space (`.content-section` margin), not rules or
  colour bands.

## Grids and rails

| Content              | Layout                                          | Class                     |
| -------------------- | ----------------------------------------------- | ------------------------- |
| Programmes           | Auto-fill grid, min 190px                       | `.shows-grid`             |
| Episodes             | Three equal columns on desktop                  | `.public-episode-grid`    |
| Articles             | Grid                                            | `.articles-grid`          |
| Guests               | Grid                                            | `.guest-grid`             |
| This week's episodes | Horizontal scroll-snap rail with `RailControls` | `.weekly-episodes__track` |

- Columns are equal (`minmax(0, 1fr)`) so titles and actions align across a
  row; card actions are pushed to the bottom (`margin-block-start: auto`).
- Rails scroll inside their own track; the page itself never scrolls
  horizontally (`html { overflow-x: clip }`). In RTL a rail starts at the
  right, and "next" moves left.
- Programme covers are shown whole (`object-fit: contain`); never crop them.

## Responsive widths

Use the canonical widths from [TOKENS.md](TOKENS.md#breakpoints):

| Width               | What changes                                                           |
| ------------------- | ---------------------------------------------------------------------- |
| `max-width: 1180px` | Compact header: smaller logo, nav gap 14px, theme label hidden         |
| `max-width: 1000px` | Header collapses to the menu button; nav wraps under the bar           |
| `max-width: 820px`  | Two-column layouts stack                                               |
| `max-width: 600px`  | Phone: player dock grows to 168px, footer 2 columns, card padding 18px |
| `min-width: 1920px` | Header widens to 1700px                                                |

Older files contain other widths (380, 430, 620, 700, 760, 800, 900, 1100,
1400); they are tracked debt. New media queries use the canonical widths. Test
every change at 390px and at desktop width.

## Right to left

- `<html lang="ar" dir="rtl">`. Write with logical properties only:
  `margin-inline-start`, `padding-block`, `inset-inline-end`, `text-align:
start`. Never `left`/`right` for layout.
- Directional icons (arrows, rail controls, back links) point in reading
  direction: "next" and "forward" point left.
- Isolate Latin and numeric runs (times, durations, emails, URLs) with `<bdi>`
  or `dir="ltr"` on the run so punctuation does not jump.
- Arabic text needs vertical room for marks: do not set a fixed height or a
  line height under `--mk-leading-tight` on Arabic copy.

## Appearances

- `data-concept="first"` (light) is the default for every visitor; the choice
  persists in `localStorage` (`mukhtalif-appearance`). The device colour scheme
  does not switch it.
- The only appearance control is `ThemeControl`, inside the site menu.
- Write components once with theme-aware tokens. A
  `[data-concept='third'] …` override is only for a deliberate difference that
  no token expresses; prefer adding a theme-aware token (level 3).
- The dark appearance is intentionally a little different in geometry too:
  softer card radius (12px vs 6px) and a wider gutter. Both come from tokens.

## Data states

| State                  | Use                                | Component                                                                                                  |
| ---------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Loading a list or grid | Skeletons with the loaded geometry | `CardSkeletonGrid`, `RowSkeletonList`, `ContentSkeleton` (`components/states.tsx`, `content-skeleton.tsx`) |
| Loading announcement   | Screen-reader text only            | `LoadingRegion`                                                                                            |
| Nothing to show        | Title plus one sentence            | `EmptyState`, account: `CustomerEmpty`                                                                     |
| Request failed         | Message plus retry                 | `ErrorState`, `RetryContentButton`                                                                         |
| Page not found         | Themed 404                         | `app/not-found.tsx`; legacy paths: `public/error-state.css`                                                |

- Show a loading state only while work is in progress. Never fill real UI with
  placeholder values, and never show invented content when data is missing:
  hide the optional section or show the error state.
- Buttons that start work show their own pending state and are disabled
  meanwhile (see COMPONENTS.md, actions).

## Forms

- Labels are visible and above the field; hints and errors sit under it.
  Errors are announced (`aria-invalid`, `aria-describedby`) and focus moves to
  the first invalid field.
- Public intake forms use the `request-form` recipe; account forms use
  `CustomerField` / `CustomerPassword`. Do not mix them on one screen.
- Native `<select>`, `<input type="file">` and `<dialog>` stay native, styled
  through their wrappers, so keyboard and screen-reader behaviour is kept.
- Disable the submit control while sending; report success only after the API
  confirms it.

## Motion

- Durations: `--mk-duration-fast` (140ms) for colour and fill changes,
  `--mk-duration-base` (160ms) for larger state changes. Easing is `ease`.
- Motion changes colour, fill or position of something already visible. It
  never reveals content that would otherwise be invisible.
- Every transition is disabled under `prefers-reduced-motion: reduce`
  (`handoff.css` does this globally).

## Imagery

- Real programme covers, episode thumbnails (YouTube artwork), guest portraits
  and the brand mark only. No stock imagery, generated illustration or CSS
  "illustrations".
- Thumbnails inside cards use `--mk-radius-media`; embeds use the card radius.
- The brand mark (`public/handoff/mukhtalif-logo*.svg`, `Wordmark`) is used
  bare, never inside a tile.
