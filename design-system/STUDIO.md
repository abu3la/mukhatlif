# Studio design system

The dashboard (`apps/admin`, "لوحة التحكم") under the same governance as the
public site: one token source, one generated sheet, one guard. This file is
the Studio's TOKENS, COMPONENTS and PATTERNS in one place; the shared rules in
[README.md](README.md), [DESIGN_LAW.md](DESIGN_LAW.md) and
[DECISIONS.md](DECISIONS.md) apply unchanged.

## How the layers fit together

```text
libs/design-tokens/src/studio.ts              ← you change values here
        │  pnpm design:build
        ▼
apps/admin/src/app/styles/00-tokens.css       ← generated: --st-* (one appearance)
        │
        ▼
01-fonts-tokens-base.css :root                ← legacy aliases (--ink, --canvas, --line …) = var(--st-*)
        │
        ▼
02 … 12 feature stylesheets                   ← read --st-* (new code) or a legacy alias (existing code)
```

- The Studio has one appearance (light). A dark appearance is open question
  Q-12 in DECISIONS.md.
- CSS load order is the numbered import list in `app/globals.css`; a rule in a
  later file wins at equal specificity.
- Values the markup needs (the domain of a page) come from the same source
  through `@mukhtalif/design-tokens`.

## The idea: one hue per domain

The Studio is an editorial desk, and every desk has its own colour of folder.
Each section owns one hue, used **tonally**: a light tint behind, a dark ink
on it, one mid tone for the mark. The eight hues share one lightness and
saturation so they read as a set, not a rainbow.

| Domain     | Sections                                          | Tint      | Tone      | Ink       |
| ---------- | ------------------------------------------------- | --------- | --------- | --------- |
| `episodes` | الحلقات, نظرة عامة                                | `#e6e8f8` | `#4453b8` | `#2c3590` |
| `shows`    | البرامج                                           | `#dcefed` | `#1e8c86` | `#0f5f5a` |
| `guests`   | الضيوف                                            | `#fbe8de` | `#c86a3b` | `#8c431f` |
| `articles` | المقالات                                          | `#f9e4ea` | `#ad4262` | `#7c2b45` |
| `academy`  | أكاديمية مختلف                                    | `#dcf4e5` | `#1fa85d` | `#14713e` |
| `audience` | المشتركون, النشرة البريدية                        | `#e9f0d8` | `#6e8c25` | `#475f14` |
| `forms`    | طلبات الموقع, النماذج والتسجيلات                  | `#f8edcd` | `#b9861d` | `#78560e` |
| `access`   | الأدوار والصلاحيات, حسابات الاستوديو, أمان الحساب | `#e4e8ef` | `#5d6d85` | `#3a4658` |

Where the hue shows:

- **Sidebar**: every nav item carries its domain mark (a small square in the
  domain tone, derived from the squares in the wordmark); the active item sits
  on the domain tint in the domain ink.
- **Page head**: the shell sets `data-domain` on `.studio-main`, and the page
  title carries the same mark.
- **Overview**: each count card sits on its domain tint and links to its
  section.
- **Status chips**: `scheduled` uses the episodes tint, `draft` the access
  tint, published / active / new the success tint, overdue / contacted the
  warning tint, canceled / rejected / spam the danger tint, `resolved` is ink.

Where it never shows: buttons (always ink), body text, borders.

## Components

Paths are under `apps/admin/src/app/styles/` unless noted.

### Actions

| Role              | Use                        | Owner                           | Recipe                                                                                                                       |
| ----------------- | -------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Primary action    | `Button variant="primary"` | `03-shared-controls-tables.css` | 44px, control radius, ink fill, on-ink label 15px medium; hover `ink-hover`. One per region                                  |
| Quiet action      | `Button` (default)         | `03`                            | 44px, transparent, `ink-soft` label 13px medium; hover fills `sunken` and turns ink                                          |
| Danger action     | `Button variant="danger"`  | `03`                            | Quiet recipe in `danger`; hover fills `danger-tint` with `danger-hover` ink                                                  |
| Disabled          | any `.button:disabled`     | `03`                            | Solid tonal step: `sunken` fill, `muted` label, no opacity. A busy button keeps its fill and shows the spinner (`aria-busy`) |
| Text link in rows | `.text-link`               | `03`                            | 32px, ink, medium; hover fills `sunken`                                                                                      |
| Back link         | `.back-link`               | `03`                            | 36px quiet link; hover fills `sunken`                                                                                        |
| Focus             | every control              | `01-fonts-tokens-base.css`      | 2px `focus` (ink) outline, offset 2. Never green: green is on-air (D-04)                                                     |

### Navigation and shell

| Role       | Use                                           | Owner | Recipe                                                                                                                        |
| ---------- | --------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------- |
| Sidebar    | `.studio-sidebar`                             | `02`  | 240px (208 under 1180, 252 from 1600), surface, `line` edge; a top bar with a menu button under 900px                         |
| Nav group  | `.studio-nav__group` + `.studio-nav__heading` | `02`  | Three groups: المحتوى, الجمهور, الإدارة. Heading 12px `muted` medium                                                          |
| Nav item   | `.studio-nav__item[data-domain]`              | `02`  | 42px (44 under 1180), control radius, 14px; domain mark 8px square; hover `sunken`; active = domain tint + domain ink, medium |
| Page head  | `.page-header` (`PageHeader`)                 | `02`  | 30px bold title (26 under 900, 24 under 420) with the domain mark; detail 13px `muted`; actions on the opposite side          |
| Breadcrumb | `.page-breadcrumb` (`PageBreadcrumb`)         | `03`  | 13px `muted`; links `ink-soft`, hover ink                                                                                     |

### Surfaces and lists

| Role         | Use                              | Owner      | Recipe                                                                                       |
| ------------ | -------------------------------- | ---------- | -------------------------------------------------------------------------------------------- |
| Card         | `.card`                          | `03`       | Surface, card radius, 1px `line-soft` edge (felt, not seen, on the tinted canvas)            |
| Count card   | `.card.stat-card[data-domain]`   | `03`       | Domain tint fill, domain ink label and value (36px bold tabular); the whole card is the link |
| Section head | `.section-card__header`          | `03`       | 58px, 17px bold title, `line` rule below                                                     |
| List row     | `.episode-row`, `.article-row` … | `03`       | 78px grid rows, `line-soft` separators; hover fills `sunken` edge to edge                    |
| Status chip  | `StatusBadge`, `.request-status` | `03`, `11` | 28px, chip radius, 12px medium, tint fill and matching ink (table above)                     |
| Empty state  | `.empty-state`                   | `03`       | 48px padding, 14px `muted`, centred                                                          |

### Fields

| Role   | Use                                       | Owner | Recipe                                                                                                                  |
| ------ | ----------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------- |
| Field  | `Field` + `Input` / `Select` / `Textarea` | `03`  | 42px, control radius, 1px `field-line`; hover `ink-soft`; focus ring; invalid `danger`; disabled on `canvas` in `muted` |
| Label  | `.field__label`                           | `03`  | 13px `ink-soft` medium                                                                                                  |
| Hint   | `.field__hint`                            | `03`  | 12px `muted`                                                                                                            |
| Switch | `Switch`                                  | `03`  | Pill track `line`, on-state `success`, knob surface                                                                     |

## Rules

1. Tokens only in new CSS: `var(--st-…)` or the legacy alias the surrounding
   file already uses. No hex, named colours, shadows, hover movement or ad-hoc
   sizes. `pnpm design:check` enforces this with the shared ratchet baseline.
2. A domain hue is a signpost, never a fill for an action. Buttons stay ink.
3. One primary action per region; everything else is a quiet action.
4. 44px minimum target for every control.
5. Verify changed screens at desktop and 390px with real clicks, and report
   what you looked at.

## Tracked debt

The Studio joined the system with its existing hard-coded values recorded in
[guard-baseline.json](guard-baseline.json) (Q-13). Converting a file is a
level 0 change proved with a before/after screenshot of every screen it
styles.

## Tokens

The tables below are generated by `pnpm design:build`.

<!-- st:tokens:start -->
<!-- GENERATED by `pnpm design:build` from libs/design-tokens/src/studio.ts. Do not edit. -->

### Colour: grounds and ink

| Token             | Value                 | Arabic name       | Role                                                                                                                 |
| ----------------- | --------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| `--st-canvas`     | `#eceef7`             | أرضية اللوحة      | Page ground behind the content column. Tinted toward the brand indigo so white cards read as cards without a border. |
| `--st-surface`    | `#ffffff`             | سطح               | Cards, panels, fields and the sidebar.                                                                               |
| `--st-sunken`     | `#e6e8f3`             | سطح غائر          | Hover fill of quiet controls and nav items; the fill of placeholders.                                                |
| `--st-line`       | `#d6d9e8`             | حد                | Structural dividers: sidebar edge, card section heads.                                                               |
| `--st-line-soft`  | `#e8eaf3`             | حد خافت           | Card edge and row separators. Close to the canvas so it is felt, not seen.                                           |
| `--st-field-line` | `#8b90b0`             | حد الحقل          | Resting border of inputs, selects and textareas.                                                                     |
| `--st-ink`        | `#171a56`             | الحبر             | Primary text and headings; the fill of primary actions.                                                              |
| `--st-ink-hover`  | `#2b2f6e`             | الحبر عند التمرير | Hover fill of ink-filled actions.                                                                                    |
| `--st-ink-soft`   | `#454a78`             | نص ثانوي          | Secondary labels, descriptions and nav items at rest.                                                                |
| `--st-muted`      | `#5f6389`             | نص خافت           | Metadata, hints and table headers. Passes 4.5:1 on canvas and surface.                                               |
| `--st-faint`      | `#7a7ea3`             | نص باهت           | Placeholders and decorative counts only; not for text that must be read.                                             |
| `--st-on-ink`     | `#ffffff`             | نص فوق الحبر      | Label colour on ink-filled actions and resolved badges.                                                              |
| `--st-focus`      | `#171a56`             | حلقة التركيز      | Keyboard focus ring on every control (2px, offset 2).                                                                |
| `--st-scrim`      | `rgb(13 15 46 / 55%)` | غطاء              | Backdrop behind dialogs and pickers.                                                                                 |

### Colour: feedback

| Token               | Value     | Arabic name         | Role                                                               |
| ------------------- | --------- | ------------------- | ------------------------------------------------------------------ |
| `--st-success`      | `#1fa85d` | نجاح                | Success marks, the switch "on" track and progress fills.           |
| `--st-success-ink`  | `#14713e` | نص النجاح           | Success text; label of published and active chips.                 |
| `--st-success-tint` | `#dcf4e5` | خلفية النجاح        | Fill of published, active and new chips.                           |
| `--st-warning`      | `#c0892a` | تنبيه               | Warning marks and the pending-upload progress fill.                |
| `--st-warning-ink`  | `#78560e` | نص التنبيه          | Warning text; label of overdue and contacted chips.                |
| `--st-warning-tint` | `#f8edcd` | خلفية التنبيه       | Fill of overdue and contacted chips.                               |
| `--st-danger`       | `#c22f2d` | خطأ                 | Error text, invalid field borders and danger actions.              |
| `--st-danger-hover` | `#a82927` | خطأ عند التمرير     | Hover ink of danger actions.                                       |
| `--st-danger-ink`   | `#8f2220` | نص الخطأ على خلفيته | Label of canceled, rejected and spam chips.                        |
| `--st-danger-tint`  | `#fbe4e3` | خلفية الخطأ         | Fill of canceled and rejected chips; hover fill of danger actions. |

### Colour: domains

| Token                | Value     | Arabic name       | Role                                                 |
| -------------------- | --------- | ----------------- | ---------------------------------------------------- |
| `--st-episodes-tint` | `#e6e8f8` | الحلقات: خلفية    | Behind episode counts and scheduled chips.           |
| `--st-episodes-tone` | `#4453b8` | الحلقات: لون      | The episodes mark in the sidebar and page head.      |
| `--st-episodes-ink`  | `#2c3590` | الحلقات: نص       | Text on the episodes tint; label of scheduled chips. |
| `--st-shows-tint`    | `#dcefed` | البرامج: خلفية    | Behind programme counts.                             |
| `--st-shows-tone`    | `#1e8c86` | البرامج: لون      | The programmes mark.                                 |
| `--st-shows-ink`     | `#0f5f5a` | البرامج: نص       | Text on the programmes tint.                         |
| `--st-guests-tint`   | `#fbe8de` | الضيوف: خلفية     | Behind guest counts.                                 |
| `--st-guests-tone`   | `#c86a3b` | الضيوف: لون       | The guests mark.                                     |
| `--st-guests-ink`    | `#8c431f` | الضيوف: نص        | Text on the guests tint.                             |
| `--st-articles-tint` | `#f9e4ea` | المقالات: خلفية   | Behind article counts.                               |
| `--st-articles-tone` | `#ad4262` | المقالات: لون     | The articles mark.                                   |
| `--st-articles-ink`  | `#7c2b45` | المقالات: نص      | Text on the articles tint.                           |
| `--st-audience-tint` | `#e9f0d8` | الجمهور: خلفية    | Behind subscriber and newsletter counts.             |
| `--st-audience-tone` | `#6e8c25` | الجمهور: لون      | The subscribers and newsletter mark.                 |
| `--st-audience-ink`  | `#475f14` | الجمهور: نص       | Text on the audience tint.                           |
| `--st-forms-tint`    | `#f8edcd` | الطلبات: خلفية    | Behind request counts.                               |
| `--st-forms-tone`    | `#b9861d` | الطلبات: لون      | The requests and forms mark.                         |
| `--st-forms-ink`     | `#78560e` | الطلبات: نص       | Text on the requests tint.                           |
| `--st-access-tint`   | `#e4e8ef` | الوصول: خلفية     | Behind role and member counts; fill of draft chips.  |
| `--st-access-tone`   | `#5d6d85` | الوصول: لون       | The roles and members mark.                          |
| `--st-access-ink`    | `#3a4658` | الوصول: نص        | Text on the access tint; label of draft chips.       |
| `--st-academy-tint`  | `#dcf4e5` | الأكاديمية: خلفية | Behind course counts.                                |
| `--st-academy-tone`  | `#1fa85d` | الأكاديمية: لون   | The academy mark (the brand green, deepened).        |
| `--st-academy-ink`   | `#14713e` | الأكاديمية: نص    | Text on the academy tint.                            |

### Type: family

| Token       | Value                                                                      | Arabic name          | Role                                                                  |
| ----------- | -------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------- |
| `--st-font` | `'IBM Plex Sans Arabic', system-ui, -apple-system, 'Segoe UI', sans-serif` | IBM Plex Sans Arabic | The only family, self-hosted from /fonts in weights 400, 500 and 700. |

### Type: weight

| Token                  | Value | Arabic name | Role                                            |
| ---------------------- | ----- | ----------- | ----------------------------------------------- |
| `--st-weight-regular`  | `400` | عادي        | Running text and resting nav items.             |
| `--st-weight-medium`   | `500` | متوسط       | Labels, chips, quiet actions, active nav items. |
| `--st-weight-semibold` | `600` | شبه عريض    | Identity lines and emphasised values.           |
| `--st-weight-bold`     | `700` | عريض        | Page and section headings, stat values.         |

### Type: size

| Token               | Value  | Arabic name     | Role                                                         |
| ------------------- | ------ | --------------- | ------------------------------------------------------------ |
| `--st-text-2xs`     | `12px` | تعليق           | Metadata, chips, table headers, hints.                       |
| `--st-text-xs`      | `13px` | بيانات          | Quiet actions, nav account links, filter rail, field labels. |
| `--st-text-sm`      | `14px` | واجهة           | Nav items, body copy in panels, definition values.           |
| `--st-text-md`      | `15px` | واجهة كبيرة     | The document default and primary action labels.              |
| `--st-text-base`    | `16px` | نص أساسي        | Section headings inside detail panels.                       |
| `--st-text-lg`      | `17px` | عنوان صغير      | Row titles and card section headings.                        |
| `--st-text-xl`      | `18px` | عنوان لوحة      | Panel headings.                                              |
| `--st-text-2xl`     | `20px` | عنوان فرعي      | Sub-headings in editors.                                     |
| `--st-text-3xl`     | `24px` | عنوان صفحة صغير | Auth panel headings; page titles on phones.                  |
| `--st-text-4xl`     | `26px` | عنوان صفحة مدمج | Page titles on tablets.                                      |
| `--st-text-5xl`     | `30px` | عنوان صفحة      | Page titles.                                                 |
| `--st-text-display` | `36px` | رقم إحصائي      | Overview stat values.                                        |

### Type: line height

| Token                  | Value  | Arabic name | Role                                |
| ---------------------- | ------ | ----------- | ----------------------------------- |
| `--st-leading-tight`   | `1.3`  | متقارب      | Stat values.                        |
| `--st-leading-heading` | `1.45` | عناوين      | Headings.                           |
| `--st-leading-ui`      | `1.5`  | واجهة       | Controls, chips and nav items.      |
| `--st-leading-body`    | `1.6`  | نص          | The document default.               |
| `--st-leading-reading` | `1.75` | قراءة       | Descriptions and definition values. |

### Spacing

| Token           | Value  | Arabic name | Role                                           |
| --------------- | ------ | ----------- | ---------------------------------------------- |
| `--st-space-4`  | `4px`  | ٤           | Hairline gaps inside compact controls.         |
| `--st-space-8`  | `8px`  | ٨           | Icon-to-label gaps, row action gaps, nav gaps. |
| `--st-space-12` | `12px` | ١٢          | Control padding, small stacks.                 |
| `--st-space-16` | `16px` | ١٦          | Default stack and grid gap.                    |
| `--st-space-20` | `20px` | ٢٠          | Compact card padding.                          |
| `--st-space-24` | `24px` | ٢٤          | Card padding and section internals.            |
| `--st-space-28` | `28px` | ٢٨          | Sidebar top padding, between nav groups.       |
| `--st-space-32` | `32px` | ٣٢          | Between blocks inside a page.                  |
| `--st-space-40` | `40px` | ٤٠          | Main column top padding.                       |
| `--st-space-48` | `48px` | ٤٨          | Main column side padding; empty-state padding. |
| `--st-space-64` | `64px` | ٦٤          | Main column bottom padding.                    |

### Radius

| Token                 | Value   | Arabic name   | Role                                         |
| --------------------- | ------- | ------------- | -------------------------------------------- |
| `--st-radius-card`    | `14px`  | زاوية البطاقة | Cards and panels.                            |
| `--st-radius-panel`   | `12px`  | زاوية اللوحة  | Inset panels and notices inside cards.       |
| `--st-radius-control` | `8px`   | زاوية الحقل   | Buttons, fields, nav items and filter items. |
| `--st-radius-chip`    | `6px`   | زاوية الشارة  | Status chips and small marks.                |
| `--st-radius-pill`    | `999px` | كبسولة        | Switch tracks and progress bars.             |
| `--st-radius-round`   | `50%`   | دائرة         | Avatars, photos and spinners.                |

### Layout

| Token                  | Value    | Arabic name           | Role                               |
| ---------------------- | -------- | --------------------- | ---------------------------------- |
| `--st-sidebar`         | `240px`  | عرض الشريط الجانبي    | Sidebar width on desktop.          |
| `--st-sidebar-compact` | `208px`  | الشريط الجانبي المدمج | Sidebar width under 1180px.        |
| `--st-sidebar-wide`    | `252px`  | الشريط الجانبي العريض | Sidebar width from 1600px.         |
| `--st-content`         | `1080px` | عرض المحتوى           | Maximum content width.             |
| `--st-content-wide`    | `1120px` | عرض المحتوى العريض    | Maximum content width from 1600px. |

### Motion

| Token                | Value   | Arabic name | Role                                       |
| -------------------- | ------- | ----------- | ------------------------------------------ |
| `--st-duration-fast` | `140ms` | سريعة       | Colour and fill state changes on controls. |

### Breakpoints

| Name   | Width    | Use                                                   |
| ------ | -------- | ----------------------------------------------------- |
| phone  | `600px`  | max-width: phones; single-column grids.               |
| tablet | `900px`  | max-width: the sidebar becomes a top bar with a menu. |
| laptop | `1180px` | max-width: compact sidebar; 44px controls.            |
| wide   | `1600px` | min-width: wider sidebar and content column.          |

<!-- st:tokens:end -->
