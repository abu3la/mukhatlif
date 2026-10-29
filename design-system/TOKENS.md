# Tokens

Tokens are the named values every screen is built from. The source is
[`libs/design-tokens/src/web.ts`](../libs/design-tokens/src/web.ts). The tables
at the end of this file are generated from it.

## How the layers fit together

```text
libs/design-tokens/src/web.ts          ← you change values here
        │  pnpm design:build
        ▼
apps/web/src/app/tokens.css            ← generated: --mk-* for both appearances
        │
        ▼
handoff.css / listener.css :root       ← legacy aliases (--fg, --surface, --night …) = var(--mk-*)
        │
        ▼
component CSS                          ← reads --mk-* (new code) or a legacy alias (existing code)
```

- Changing a token value changes every place that uses it, in the right
  appearance. That is the intended way to retune the site.
- `tokens.css` sets light values on `:root` and repeats only the tokens that
  differ under `:root[data-concept='third']` (the dark appearance). Components
  never need their own dark-mode colour rule when they use a theme-aware token.
- The static error page (`apps/web/public/error-state.css`) cannot load
  `tokens.css`; `design:build` writes its four colours in place between the
  `mk:light` / `mk:dark` markers.
- JavaScript that needs a colour (the browser `theme-color`) imports
  `webThemeColor` from `@mukhtalif/design-tokens`.

## Choosing a token

1. Choose by **role**, not by colour. Body text is `--mk-ink` because it is
   text, not because it happens to be indigo.
2. Theme-aware roles (`--mk-page`, `--mk-ink`, `--mk-card` …) are the default
   for anything on the page.
3. `--mk-brand-green` is the on-air colour. It belongs to playback (play
   buttons, progress) and the dark-mode success tone. Never use it as
   decoration, a heading accent or a link colour.
4. The broadcast palette (`--mk-broadcast-*`) belongs to the player dock and
   the dark brand panels that share its world. It does not change with the
   appearance. Do not use it for ordinary page content.
5. `--mk-destructive` is only for irreversible account actions, together with
   their confirmation step.
6. Type sizes come from the `--mk-text-*` steps; weights from `--mk-weight-*`;
   line heights from `--mk-leading-*`; spacing from `--mk-space-*`; radii from
   `--mk-radius-*`. If the step you need is missing, that is a design decision:
   follow [README.md](README.md#change-levels), do not invent a value.

## Legacy aliases

Existing CSS reads short names from the September handoff and the earlier
listener layer. They are now thin aliases of tokens, so changing the token is
enough. New code uses `--mk-*` directly; do not add new aliases.

| Alias                                                         | Resolves to                                             | Defined in                                  |
| ------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------- |
| `--bg`, `--page`                                              | `--mk-page`                                             | `handoff.css :root`                         |
| `--fg`, `--ink`                                               | `--mk-ink`                                              | `handoff.css :root`                         |
| `--surface`                                                   | `--mk-surface`                                          | `handoff.css :root`                         |
| `--surface-hover`                                             | `--mk-surface-hover`                                    | `handoff.css :root`                         |
| `--content-card`                                              | `--mk-card`                                             | `handoff.css :root`                         |
| `--muted`, `--secondary`                                      | `--mk-ink-muted`                                        | `handoff.css :root`                         |
| `--ink-hover`                                                 | `--mk-ink-hover`                                        | `handoff.css :root`                         |
| `--action-ink`                                                | `--mk-on-ink`                                           | `handoff.css :root`                         |
| `--border`, `--line`                                          | `--mk-border`                                           | `handoff.css :root`                         |
| `--line-soft`                                                 | `--mk-border-soft`                                      | `handoff.css :root`                         |
| `--success`                                                   | `--mk-success`                                          | `handoff.css :root`                         |
| `--danger`                                                    | `--mk-danger`                                           | `handoff.css :root`                         |
| `--radius`, `--radius-card`, `--radius-md`                    | `--mk-radius-card`                                      | `handoff.css`, `listener.css`               |
| `--radius-input`, `--radius-sm`                               | `--mk-radius-control`                                   | `handoff.css`, `listener.css`               |
| `--radius-badge`                                              | `--mk-radius-control`                                   | `listener.css :root`                        |
| `--radius-pill`                                               | `--mk-radius-pill`                                      | `listener.css :root`                        |
| `--space`, `--gutter`                                         | `--mk-gutter`                                           | `handoff.css :root`                         |
| `--font`                                                      | `--mk-font`                                             | `handoff.css :root`                         |
| `--measure`                                                   | `--mk-measure`                                          | `handoff.css :root`                         |
| `--measure-episode`                                           | `--mk-measure-episode`                                  | `listener.css :root`                        |
| `--measure-article`, `--measure-prose`                        | `--mk-measure-article`                                  | `listener.css :root`                        |
| `--footer-background` / `--footer-ink` / `--footer-secondary` | `--mk-footer` / `--mk-footer-ink` / `--mk-footer-muted` | `handoff.css .site-footer`                  |
| `--night`                                                     | `--mk-broadcast-ground`                                 | `listener.css :root`                        |
| `--night-raised`, `--ink-raised`                              | `--mk-broadcast-surface`                                | `listener.css :root`                        |
| `--night-lifted`, `--ink-lifted`                              | `--mk-broadcast-raised`                                 | `listener.css :root`                        |
| `--night-line`                                                | `--mk-broadcast-line`                                   | `listener.css :root`                        |
| `--night-text`, `--text`                                      | `--mk-broadcast-ink`                                    | `listener.css :root`                        |
| `--night-muted`, `--text-faint`                               | `--mk-broadcast-ink-faint`                              | `listener.css :root`                        |
| `--text-muted`                                                | `--mk-broadcast-ink-soft`                               | `listener.css :root`                        |
| `--green`, `--signal`                                         | `--mk-brand-green`                                      | `listener.css :root`                        |
| `--green-hover`                                               | `--mk-brand-green-hover`                                | `listener.css :root`                        |
| `--green-dark`                                                | `--mk-brand-green-ink`                                  | `listener.css :root`                        |
| `--warning`                                                   | `--mk-warning`                                          | `listener.css :root`                        |
| `--space-lg` / `--space-xl`                                   | `--mk-space-20` / `--mk-space-32`                       | `listener.css :root`                        |
| `--player-height`                                             | `94px` (`168px` under 600px)                            | `handoff.css`; player geometry, not a token |

Two scopes redefine aliases locally. Inside them a legacy name does not mean
the page value, which is why existing code must not be bulk-renamed:

- `.mukhtalif-player-bar`, `.mukhtalif-player-inline` (`listener.css`):
  `--line` and `--line-soft` become `--night-line`.
- `.home-newsletter .newsletter-signup` (`listener.css`): the `--night*` names
  become page colours and `--green` becomes `--green-dark`, so the newsletter
  sits on the light page.

## Hard-coded values that remain

`pnpm design:check` counts the hard-coded values still in each file and
records them in [`guard-baseline.json`](guard-baseline.json). Colours,
shadows and hover movement are already at zero everywhere. Spacing, a few
off-scale type sizes, radii and media widths remain as tracked debt: a file
may lose them, never gain them. Moving one of these onto a token is welcome;
changing what it looks like is a design decision.

## Reference

<!-- mk:tokens:start -->
<!-- GENERATED by `pnpm design:build` from libs/design-tokens/src/web.ts. Do not edit. -->

### Colour: roles

| Token                | Light     | Dark      | Arabic name        | Role                                                                                                                                                |
| -------------------- | --------- | --------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--mk-page`          | `#ffffff` | `#1a1b19` | أرضية الصفحة       | Page ground behind all content. Also the browser theme-color.                                                                                       |
| `--mk-surface`       | `#f4f5fa` | `#272925` | سطح مرتفع          | Panels, dialogs and the hover fill of quiet header controls.                                                                                        |
| `--mk-surface-hover` | `#e9edf7` | `#353a32` | سطح عند التمرير    | Hover fill of controls that sit on `surface`.                                                                                                       |
| `--mk-card`          | `#e8ecf8` | `#2c302a` | بطاقة محتوى        | Fill of content cards: episodes, articles, account cards.                                                                                           |
| `--mk-ink`           | `#171a56` | `#f5f6f3` | الحبر              | Primary text and headings; the fill of primary actions.                                                                                             |
| `--mk-ink-hover`     | `#383c75` | `#dce3d7` | الحبر عند التمرير  | Hover fill of ink-filled primary actions.                                                                                                           |
| `--mk-ink-muted`     | `#505568` | `#b8c0b7` | نص ثانوي           | Metadata, descriptions, hints and secondary labels.                                                                                                 |
| `--mk-on-ink`        | `#ffffff` | `#1a1b19` | نص فوق الحبر       | Label and icon colour on ink-filled actions.                                                                                                        |
| `--mk-border`        | `#c7c9d7` | `#60675c` | حد                 | Field borders and structural dividers.                                                                                                              |
| `--mk-border-soft`   | `#e1e3ed` | `#41473e` | حد خافت            | Quiet separators between list rows.                                                                                                                 |
| `--mk-success`       | `#14713e` | `#38df82` | نجاح               | Confirmation text after a completed action.                                                                                                         |
| `--mk-danger`        | `#c22f2d` | `#ff7775` | خطأ                | Error text and invalid field borders in public forms.                                                                                               |
| `--mk-danger-text`   | `#c22f2d` | `#ff8583` | خطأ في الحساب      | Error text in account forms and danger rows. Same as `danger` in light; a slightly lighter red in dark (consolidation candidate, see DECISIONS.md). |
| `--mk-footer`        | `#171a56` | `#10120f` | أرضية التذييل      | Footer floor; deliberately darker than the page in both appearances.                                                                                |
| `--mk-footer-ink`    | `#ffffff` | `#f5f6f3` | نص التذييل         | Footer links, tagline and email.                                                                                                                    |
| `--mk-footer-muted`  | `#c7c9df` | `#b8c0b7` | نص التذييل الثانوي | Footer copyright and link hover.                                                                                                                    |

### Colour: brand

| Token                    | Value     | Arabic name           | Role                                                                                                       |
| ------------------------ | --------- | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `--mk-brand-indigo`      | `#171a56` | نيلي مختلف            | The logo ink. The light appearance builds its ink from it.                                                 |
| `--mk-brand-green`       | `#38df82` | أخضر البث             | On-air green. Reserved for playback: play buttons, progress, the dark-mode success tone. Never decoration. |
| `--mk-brand-green-hover` | `#5ce69a` | أخضر البث عند التمرير | Hover fill of green play buttons.                                                                          |
| `--mk-brand-green-deep`  | `#1fa85d` | أخضر عميق             | Green marks on light grounds where `brandGreen` lacks contrast.                                            |
| `--mk-brand-green-ink`   | `#14713e` | أخضر نصي              | Green text on light grounds, e.g. premium labels.                                                          |

### Colour: broadcast (player)

| Token                        | Value     | Arabic name               | Role                                                                   |
| ---------------------------- | --------- | ------------------------- | ---------------------------------------------------------------------- |
| `--mk-broadcast-ground`      | `#0d0f2e` | أرضية البث                | Deepest broadcast ground; also the label colour on green play buttons. |
| `--mk-broadcast-surface`     | `#151845` | سطح المشغّل               | Player dock fill.                                                      |
| `--mk-broadcast-raised`      | `#1d2154` | زر المشغّل                | Secondary transport, tools and close buttons in the dock.              |
| `--mk-broadcast-hover`       | `#262b73` | زر المشغّل عند التمرير    | Hover fill of dock buttons and the speed control.                      |
| `--mk-broadcast-line`        | `#2c3060` | حد البث                   | Dock edge and broadcast-panel borders.                                 |
| `--mk-broadcast-line-strong` | `#3a3f78` | حد زر المشغّل             | Border of dock buttons.                                                |
| `--mk-broadcast-line-hover`  | `#4a5090` | حد زر المشغّل عند التمرير | Border of dock buttons on hover.                                       |
| `--mk-broadcast-track`       | `#454b8a` | مسار التقدّم              | Unplayed part of the playback timeline.                                |
| `--mk-broadcast-ink`         | `#eaebf6` | نص البث                   | Primary text and icons on broadcast surfaces.                          |
| `--mk-broadcast-ink-soft`    | `#c4c7df` | نص البث الهادئ            | Legacy muted text alias (`--text-muted`).                              |
| `--mk-broadcast-ink-muted`   | `#bfc3df` | نص البث الثانوي           | Show title, status and times in the dock.                              |
| `--mk-broadcast-ink-faint`   | `#9fa3c8` | نص البث الخافت            | Faint labels and disabled dock controls.                               |
| `--mk-broadcast-thumb`       | `#ffffff` | مقبض التقدّم              | Fill of the playback slider thumb.                                     |
| `--mk-broadcast-danger`      | `#ffaaa9` | خطأ على البث              | Player error text.                                                     |
| `--mk-broadcast-danger-line` | `#f3a8a4` | حد خطأ على البث           | Invalid field border on broadcast panels.                              |
| `--mk-broadcast-danger-text` | `#f3b6b2` | نص خطأ على البث           | Field error and feedback text on broadcast panels.                     |

### Colour: feedback and overlays

| Token                    | Value                 | Arabic name           | Role                                                                              |
| ------------------------ | --------------------- | --------------------- | --------------------------------------------------------------------------------- |
| `--mk-warning`           | `#d08a2e`             | تنبيه                 | Warning state; not used as decoration.                                            |
| `--mk-destructive`       | `#a82927`             | إجراء حذف             | Fill of irreversible account actions (delete, clear).                             |
| `--mk-destructive-hover` | `#85211f`             | إجراء حذف عند التمرير | Hover fill of destructive actions.                                                |
| `--mk-on-destructive`    | `#ffffff`             | نص فوق إجراء الحذف    | Label colour on destructive actions.                                              |
| `--mk-scrim`             | `rgb(0 0 0 / 0.5)`    | غطاء النافذة          | Backdrop behind account dialogs.                                                  |
| `--mk-scrim-account`     | `rgb(0 0 0 / 0.55)`   | غطاء نافذة الحساب     | Earlier account-dialog backdrop, overridden by `scrim` (consolidation candidate). |
| `--mk-scrim-menu`        | `rgb(13 15 46 / 55%)` | غطاء القائمة          | Backdrop behind the site menu dialog.                                             |
| `--mk-video-letterbox`   | `#111111`             | خلفية الفيديو         | Behind the YouTube frame while it loads.                                          |

### Type: family

| Token       | Value                              | Arabic name          | Role                                                                                                  |
| ----------- | ---------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------- |
| `--mk-font` | `Mukhtalif, system-ui, sans-serif` | IBM Plex Sans Arabic | The only family. Self-hosted from /handoff/fonts under the name "Mukhtalif". Never add a second face. |

### Type: weight

| Token                  | Value | Arabic name | Role                                   |
| ---------------------- | ----- | ----------- | -------------------------------------- |
| `--mk-weight-regular`  | `400` | عادي        | Running text.                          |
| `--mk-weight-medium`   | `500` | متوسط       | UI labels, navigation, captions.       |
| `--mk-weight-semibold` | `600` | شبه عريض    | Card titles and primary action labels. |
| `--mk-weight-bold`     | `700` | عريض        | Page and section headings.             |

### Type: size

| Token            | Value  | Arabic name     | Role                                             |
| ---------------- | ------ | --------------- | ------------------------------------------------ |
| `--mk-text-2xs`  | `12px` | تعليق           | Captions, copyright, progress labels.            |
| `--mk-text-xs`   | `13px` | بيانات          | Metadata, helper text, small labels.             |
| `--mk-text-sm`   | `14px` | واجهة           | UI text: navigation, buttons, card descriptions. |
| `--mk-text-md`   | `15px` | واجهة كبيرة     | Footer tagline, larger UI labels.                |
| `--mk-text-base` | `16px` | نص أساسي        | Body text. The document default.                 |
| `--mk-text-lg`   | `17px` | مقدمة           | Leads and show-card captions.                    |
| `--mk-text-xl`   | `18px` | عنوان صغير      | Small titles.                                    |
| `--mk-text-2xl`  | `20px` | عنوان بطاقة     | Card titles.                                     |
| `--mk-text-3xl`  | `24px` | عنوان قسم       | Section and dialog headings.                     |
| `--mk-text-4xl`  | `26px` | عنوان قسم كبير  | Larger section headings.                         |
| `--mk-text-5xl`  | `30px` | عنوان صفحة صغير | Compact page headings.                           |

### Type: line height

| Token                  | Value | Arabic name | Role                                         |
| ---------------------- | ----- | ----------- | -------------------------------------------- |
| `--mk-leading-tight`   | `1.3` | متقارب      | Large display numbers and compact headings.  |
| `--mk-leading-heading` | `1.5` | عناوين      | Headings (the handoff default for h1 to h3). |
| `--mk-leading-ui`      | `1.6` | واجهة       | Card titles and UI blocks.                   |
| `--mk-leading-body`    | `1.8` | نص          | Descriptions and running text.               |
| `--mk-leading-reading` | `1.9` | قراءة       | Long-form reading and article bodies.        |

### Spacing

| Token           | Value  | Arabic name | Role                                   |
| --------------- | ------ | ----------- | -------------------------------------- |
| `--mk-space-4`  | `4px`  | ٤           | Hairline gaps inside compact controls. |
| `--mk-space-8`  | `8px`  | ٨           | Icon-to-label gaps, tight stacks.      |
| `--mk-space-12` | `12px` | ١٢          | Field internals, small stacks.         |
| `--mk-space-16` | `16px` | ١٦          | Default stack and grid gap.            |
| `--mk-space-20` | `20px` | ٢٠          | Card rails, dialog heads.              |
| `--mk-space-24` | `24px` | ٢٤          | Card padding, section internals.       |
| `--mk-space-32` | `32px` | ٣٢          | Between blocks inside a section.       |
| `--mk-space-40` | `40px` | ٤٠          | Footer and section padding.            |
| `--mk-space-48` | `48px` | ٤٨          | Between sections on small screens.     |
| `--mk-space-64` | `64px` | ٦٤          | Between sections.                      |
| `--mk-space-96` | `96px` | ٩٦          | Large page breaks.                     |

### Radius

| Token                 | Light   | Dark   | Arabic name   | Role                                                            |
| --------------------- | ------- | ------ | ------------- | --------------------------------------------------------------- |
| `--mk-radius-card`    | `6px`   | `12px` | زاوية البطاقة | Cards, panels, embeds. Softer in the dark appearance by design. |
| `--mk-radius-control` | `8px`   | same   | زاوية الحقل   | Inputs, selects and dialog fields.                              |
| `--mk-radius-media`   | `10px`  | same   | زاوية الصورة  | Images inside cards.                                            |
| `--mk-radius-dialog`  | `16px`  | same   | زاوية النافذة | Account dialogs.                                                |
| `--mk-radius-pill`    | `999px` | same   | كبسولة        | Primary actions and filter choices.                             |
| `--mk-radius-round`   | `50%`   | same   | دائرة         | Round icon buttons, portraits and marks.                        |

### Layout

| Token                  | Light                      | Dark                       | Arabic name     | Role                                                      |
| ---------------------- | -------------------------- | -------------------------- | --------------- | --------------------------------------------------------- |
| `--mk-gutter`          | `clamp(20px, 4.5vw, 78px)` | `clamp(20px, 5.5vw, 90px)` | الهامش الجانبي  | Page side gutter. Wider in the dark appearance by design. |
| `--mk-measure`         | `1500px`                   | same                       | عرض المحتوى     | Maximum content width.                                    |
| `--mk-measure-episode` | `840px`                    | same                       | عرض صفحة الحلقة | Episode detail column.                                    |
| `--mk-measure-article` | `760px`                    | same                       | عرض المقال      | Article reading column.                                   |

### Motion

| Token                | Value   | Arabic name | Role                                       |
| -------------------- | ------- | ----------- | ------------------------------------------ |
| `--mk-duration-fast` | `140ms` | سريعة       | Colour and fill state changes on controls. |
| `--mk-duration-base` | `160ms` | عادية       | Larger state changes.                      |

### Breakpoints

| Name    | Width    | Use                                            |
| ------- | -------- | ---------------------------------------------- |
| phone   | `600px`  | max-width: phones.                             |
| tablet  | `820px`  | max-width: small tablets.                      |
| compact | `1000px` | max-width: the header collapses into the menu. |
| laptop  | `1180px` | max-width: compact desktop header.             |
| wide    | `1920px` | min-width: very wide screens.                  |

<!-- mk:tokens:end -->
