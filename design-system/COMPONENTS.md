# Components

Every UI role on the site, the recipe to use for it, and where that recipe
lives. Paths are under `apps/web/src/`. The live examples are on the
`/design-system` page.

How to read this file:

- **Use** is the recipe for new work. Reuse its class or component as is.
- **Legacy** recipes are still on screen but must not be copied. Converging
  them is an owner decision (see [Duplicates to resolve](#duplicates-to-resolve)).
- CSS load order matters: `components/customer.css` → `app/tokens.css` →
  `app/listener.css` → `app/handoff.css` → `app/public-pages.css`. A rule in a
  later file wins at equal specificity, so edit the rule that actually wins
  (search all four files for the selector).

## Actions

| Role                          | Use                                                                           | Owner                                                        | Recipe                                                                                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primary action, public pages  | `.public-primary` (also `RetryContentButton`, `LatestEpisodeAction`)          | `app/public-pages.css`                                       | Pill, 52px min height, padding 12 × 26, ink fill, on-ink label, 16px semibold, gap 12; hover is a tonal mix of ink and page. Focus: 3px ink outline, offset 4 |
| Primary action, account flows | `.customer-primary`                                                           | `components/customer.css`                                    | Same pill as above with a 1px ink border; disabled at 45% opacity inside account pages and dialogs                                                            |
| Text action                   | `.public-text-action` (public), `.customer-text-button` (account)             | `public-pages.css`, `customer.css`                           | No fill, 44px min height, padding 8 × 10, ink text; hover adds a 6% ink wash                                                                                  |
| Icon-only action              | `.icon-action` with `BrandIcon`                                               | `app/handoff.css`, `components/brand-icon.tsx`               | 44 × 44, transparent, card radius, 22px filled icon, `aria-label` required; hover fills with `surface`                                                        |
| Icon action in account UI     | `.customer-icon-button` with `CustomerIcon`                                   | `customer.css`, `components/customer-ui.tsx`                 | 44px circle, page fill, 1px border; hover inverts to ink                                                                                                      |
| Destructive                   | `.customer-primary.customer-destructive`, always inside a confirmation dialog | `customer.css`                                               | Primary pill in `--mk-destructive`, hover `--mk-destructive-hover`, label `--mk-on-destructive`                                                               |
| Play an episode               | `PlayEpisodeButton` (`variant="icon"` or label)                               | `components/player.tsx`, `player.module.css`                 | 44px circle in ink on the page; green with broadcast-ground label on the dock and inline player. Never restyle it at a call site                              |
| Rail previous / next          | `RailControls` (`.public-rail-controls button`)                               | `components/public-content-controls.tsx`, `public-pages.css` | 44px circle on `surface`; hover inverts. Arrows follow RTL                                                                                                    |

Rules:

- One primary action per region. A second action is a text action, never an
  outlined twin.
- Buttons never move or scale on hover (`DESIGN_LAW.md`).
- Every control that starts work shows its pending state and is disabled
  meanwhile; reuse the pending treatment the component already has.
- Minimum target 44 × 44 for everything clickable.

Legacy (do not copy): `.customer-dialog button[type='submit']` / `.dialog-primary`,
`.request-form__submit`, `.newsletter-signup__submit`, `.guest-search__submit`,
`.action`, `.pager__link` and the header `.sponsor` are seven more filled
primary recipes with different heights, weights and radii.

## Selection

| Role                       | Use                                                         | Owner                              | Recipe                                                                    |
| -------------------------- | ----------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| Filter a list (navigation) | `.public-filter-tabs` of `Link`s with `aria-current="page"` | `public-pages.css`                 | Pills on `surface`, 44px, padding 8 × 20; current inverts to ink fill     |
| Sections of the library    | `.customer-library-tabs`                                    | `customer.css`                     | Plain text tabs, muted; current is ink and semibold                       |
| Pick several               | `.customer-choice` (checkbox chip)                          | `customer.css`                     | Pill with border; checked inverts to ink                                  |
| Pick one, with description | `.request-form__choice` (radio card)                        | `listener.css`, `public-pages.css` | Bordered card, control radius; checked fills `surface` with an ink border |

Filters keep their state in the URL (query parameters), so they survive reload
and share.

## Fields and forms

| Role                  | Use                                                                  | Owner                                                             | Recipe                                                                                                                                                     |
| --------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Account text field    | `CustomerField`, `CustomerPassword`                                  | `components/customer-ui.tsx`, `customer.css`                      | Label 15px medium above; input 50px, padding 10 × 14, page fill, 1px border, card radius; hint 12px muted; error in `--mk-danger-text` with `aria-invalid` |
| Public intake field   | `.request-form__field` inside `RequestForm` / `ProductionRequest`    | `components/request-form.tsx`, `listener.css`, `public-pages.css` | Label 15px bold; input 50px, radius 10; error `.request-form__feedback`                                                                                    |
| Search and filter bar | `.public-filters` (`label` + input/select)                           | `public-pages.css`                                                | Inputs 50px, radius 8; first field wider                                                                                                                   |
| File upload           | `.public-upload-control` wrapping a hidden native `input[type=file]` | `components/request-form.tsx`, `public-pages.css`                 | Arabic choose/remove controls, 44px targets                                                                                                                |
| Checkbox / consent    | native input with `accent-color: var(--fg)`, 18px                    | `customer.css`, `public-pages.css`                                | Label text 14px                                                                                                                                            |

See [PATTERNS.md](PATTERNS.md#forms) for validation and submission behaviour.

## Dialogs

| Role                        | Use                                                          | Owner                                                          | Recipe                                                                                                                         |
| --------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Account and content dialogs | `CustomerDialog` (native `<dialog class="customer-dialog">`) | `components/customer-ui.tsx`, `customer.css` + `handoff.css`   | Max 540px, padding 28, `surface` fill, 1px border, dialog radius 16, `--mk-scrim` backdrop; close is a `.customer-icon-button` |
| Site menu                   | `SiteNavigation` menu dialog                                 | `components/site-navigation.tsx`, `site-navigation.module.css` | Wide sheet, page fill, radius 18, `--mk-scrim-menu` backdrop, grouped links, the appearance control                            |

Native `<dialog>` keeps focus trapping and Escape; focus returns to the trigger
on close.

## Content

| Role                 | Use                                                 | Owner                                                            | Recipe                                                                                                                                                           |
| -------------------- | --------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Programme            | `ShowCard`                                          | `components/cards.tsx`, `listener.css` + `handoff.css`           | Square cover shown whole (`contain`), caption 17px medium under it; hover tones the caption                                                                      |
| Episode              | `EpisodeCard` (`.handoff-episode-card`)             | `cards.tsx`, `handoff.css`                                       | `card` fill, card radius, padding 22; 16:9 thumbnail at media radius; meta 13px muted; title 20px semibold; two-line description; actions anchored to the bottom |
| Article              | `ArticleCard` (`.card.article-card`)                | `cards.tsx`, `listener.css` + `handoff.css`                      | `card` fill, padding 24; 16:9 cover; title 20px bold; three-line excerpt; byline at the bottom; hover fills `surface-hover`                                      |
| Guest                | `GuestCard`                                         | `components/guest-card.tsx`, `listener.css` + `public-pages.css` | Portrait beside name and role. Renders differently on `/guests` and `/search` (see below)                                                                        |
| Account rows         | `CustomerEpisodeRow`, `.customer-account-row`       | `components/customer-content.tsx`, `customer-account.tsx`        | `surface` rows; account rows are full-width buttons with a chevron                                                                                               |
| This week's episodes | `WeeklyEpisodes` + `RailControls`                   | `components/weekly-episodes.tsx`                                 | Scroll-snap rail of `EpisodeCard`s                                                                                                                               |
| Pager                | `Pager`                                             | `components/pager.tsx`, `listener.css`                           | "الأحدث" / "صفحة n من m" / "الأقدم"; links keep the current query                                                                                                |
| Section head         | `.content-section__header` + `__title` (+ `__more`) | `listener.css`                                                   | Title clamp(20px, 2vw, 24px) bold; "see all" link at the end of the row                                                                                          |
| Page head            | `.public-page-head`                                 | `public-pages.css`                                               | h1 clamp(32px, 4vw, 56px) semibold + one muted lead line                                                                                                         |

`EpisodeRow` in `cards.tsx` has no call sites; do not build on it without a
decision.

## States

| Role                          | Use                                                       | Owner                                           |
| ----------------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| Loading grid / rows           | `CardSkeletonGrid`, `RowSkeletonList`, `ContentSkeleton`  | `components/states.tsx`, `content-skeleton.tsx` |
| Empty                         | `EmptyState`; account: `CustomerEmpty`                    | `states.tsx`, `customer-ui.tsx`                 |
| Error with retry              | `ErrorState` (+ `RetryContentButton`)                     | `states.tsx`                                    |
| Toast after an account action | `.customer-toast`                                         | `customer.css`                                  |
| Inline status                 | `role="status"` text in muted 13–14px next to the control | per component                                   |

## Chrome

| Role              | Use                                                                                                   | Owner                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Header            | `SiteHeader` / `SiteNavigation`: logo, primary nav, icon search, "مكتبتي", "الشراكات والرعايات", menu | `components/site-chrome.tsx`, `site-navigation.tsx`, `site-navigation.module.css` |
| Appearance switch | `ThemeControl`, inside the menu only                                                                  | `components/theme-control.tsx`                                                    |
| Footer            | `SiteFooter` on its own floor (`--mk-footer*`)                                                        | `components/site-chrome.tsx`, `handoff.css`                                       |
| Player dock       | `PlayerProvider` / `PlayerBar`, broadcast palette                                                     | `components/player.tsx`, `player.module.css`                                      |
| Newsletter        | `NewsletterSignup` (home places it after the latest articles)                                         | `components/newsletter-signup.tsx`, `listener.css` + `public-pages.css`           |

## Duplicates to resolve

Found by a full source audit of the cascade on 2026-10-29. Each is a visible
change, so each needs the owner's choice (DECISIONS.md Q-05).

1. **Nine filled primary recipes.** Heights 52 / 48 / 46 / 44 / none; radius
   pill, 8px or card radius; weight 500 / 600 / 700; label colour on-ink or
   `surface`; hover tonal mix, opacity, border-only or `ink-hover`; disabled
   none, 45% or 55%. Proposal: keep `.public-primary` / `.customer-primary`
   (52px pill, semibold) as the one recipe, with a 44px compact size.
2. **Two text buttons side by side.** `.public-text-action` is 14px with a 6px
   radius; `.customer-text-button` is 16px with no radius. They sit together in
   the article reading controls.
3. **Five icon-button recipes** (square or circle, transparent or filled, icon
   16 to 22px) and two icon sets (filled `BrandIcon`, stroked `CustomerIcon`).
4. **Seven field recipes.** Height 44 to 54, radius 6 / 8 / 10 / card,
   different padding; hover and focus border feedback exists only on the guest
   search.
5. **Two dialog shells** (radius 16 vs 18, fill `surface` vs page, border vs
   none, two backdrops, three close buttons).
6. **Card containers.** Same role, fills `card` or `surface`; radii card, 12,
   14, 16, 18; padding 18 to 28; four different hover treatments; title weight
   500 to 700.
7. **`GuestCard` changes recipe by page:** radius 14, padding 24, no border,
   name 26px on `/guests`; card radius, 1px border, no padding, name 21px on
   `/search`.
8. **Two tab patterns** for the same job (`.public-filter-tabs` pills,
   `.customer-library-tabs` text).
9. **Page heads** use nine different h1 sizes, three weights and four line
   heights; `/articles` does not use `.public-page-head`.
10. **Focus rings:** 3px ink offset 4 on some controls, 3px `currentColor`
    elsewhere, which on filled buttons is the light label colour.

## Known defects from the audit

Source analysis shows these declared states never apply because a later rule
wins. They are recorded, not yet fixed or visually confirmed; fixing them
restores intended behaviour (level 0) but changes what renders, so confirm
before shipping.

1. In the account password dialog the field loses its 56px end padding
   (`handoff.css` `.customer-dialog input` wins), so typed text can run under
   the show/hide button.
2. Inside dialogs, in light mode, `.customer-error` and `.customer-message`
   render muted (`.customer-dialog p` wins).
3. Inside dialogs, the required-field asterisk wraps onto its own line
   (`.customer-dialog label { display: grid }`).
4. Dialog mobile padding (22px) and mobile title size (21px) never apply.
5. Request-form inputs lose their hover and focus border colours.
6. The home newsletter inputs lose hover, focus and invalid borders, so an
   invalid email gets no border change; its submit loses its hover fill.
7. `.public-filter-tabs` links have no hover state.
8. Between 601 and 820px the footer's responsive columns are overridden.
9. In dark mode the episode-card play button hovers to `ink-hover`, not the
   green hover used on the dock.
10. `.customer-secondary` (episode moments) has no CSS at all and renders as a
    browser-default button.

## Dead code

No call sites at the time of the audit: `EpisodeRow` and its `.episode-row__*`
variants, `ComingSoon`, `app/about/about.module.css`, `.dialog-primary`,
`.action-error`, and most of the older header, footer, hero and card rules in
`listener.css` (`.masthead*`, `.home-hero*`, `.weekly-episode-card*`,
`.colophon*`, `.site-footer__links` and others) plus the unused `.site-header*`
rules in `handoff.css`. Removing them changes nothing on screen; do it in its
own change and prove it with [`style-snapshot.js`](style-snapshot.js).
