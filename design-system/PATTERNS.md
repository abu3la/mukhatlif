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
  colour bands. The presentation pages are the exception (below).

## Presentation pages (D-24)

The home, programme, community, episode, reading, newsletter, listening,
search, library and sign-in pages introduce rather than list. Their rhythm is stage, sheet, floor
(`app/stage.css`):

| Part  | What it is                                                                | Built from                                                      |
| ----- | ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Stage | The night ground (home) or the programme's cover ground                   | `.stage-scope` / `.cover-stage`, `--mk-stage*` / `--mk-cover-*` |
| Sheet | Page-coloured, its rounded top over the stage and its bottom on the floor | `.home-sheet` / `.cover-sheet` + `.home-sheet__surface`         |
| Floor | Production, credits and the footer on the footer colour                   | `.floor-scope`, `SiteFooter`                                    |

- Scopes redefine the legacy aliases, so shared recipes (primary pill, focus
  rings, rail arrows, header controls) take the ground's colours without
  call-site overrides. The header becomes transparent over a stage.
- Section statements use `.stage-statement` (`--mk-display-1`); text links are
  `.stage-link` (underlined, no arrow).
- Rails are `.stage-rail` (edge to edge, first item on the content edge,
  `RailControls` for arrows, `position: relative` so a card's absolutely placed
  parts stay inside the rail).
- Routes are drawn as a trace plus ink; content never waits for them.
- A page's head on a stage is centred (`.stage-head`): where it belongs, the
  title, one line, its facts, its actions. A video or cover may cross from the
  stage onto the sheet (`.has-cross` + `.stage-cross`); the sheet's first
  section starts below it.
- Grids on a sheet hold every slot (a tile's title keeps two lines, a missing
  cover keeps its frame), so rows share their lines.
- An index stands on `.stage-intro`: its statement, one line and a fact in
  the stage's ink. Its newest item crosses onto the sheet and is introduced
  there (`.stage-feature`); a search, a later page or another order shows the
  list alone. A choice below the stage (a programme, an order, a page) reloads
  the list at its anchor (`#all`) so the reader stays at the list.
- Account pages keep their stage while the account loads; the gate's states
  sit on the sheet (`CustomerGate bare`).

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
