# Decisions

The design decisions the site is built on, newest last, and the open
questions that need the owner. Any level 1 to 3 change (see
[README.md](README.md#change-levels)) adds a line here so the reason survives
the next edit.

Format: `D-nn · date · decision · why / source`.

## Decided

- **D-01 · 2026-09-08 · One family.** IBM Plex Sans Arabic, self-hosted from
  `public/handoff/fonts` as `Mukhtalif`, weights 400/500/600/700. No second
  face. Source: the September design handoff.
- **D-02 · 2026-09-08 · Two appearances.** Light: indigo ink `#171a56` on
  white. Dark (`data-concept="third"`): warm green-black `#1a1b19`, not a
  blue slate. Source: handoff.
- **D-03 · 2026-09-08 · Light by default.** Every visitor starts in light,
  independent of the device colour scheme; the choice persists per browser.
  Source: PR #17.
- **D-04 · 2026-09-08 · Green means on air.** `#38df82` is reserved for
  playback controls and progress, plus the dark-mode success tone. Source:
  handoff and the design audit.
- **D-05 · 2026-09-08 · Primary actions are ink pills.** One primary action
  per region, filled with ink, pill radius. Secondary actions are text
  actions, not outlined twins. Source: handoff.
- **D-06 · 2026-09-08 · Footer floor.** The footer steps onto its own darker
  floor: indigo in light, `#10120f` in dark, with the white brand mark. It is
  the one deliberate colour break on the page. Source: owner request recorded
  in `docs/design-handoff-audit.md`.
- **D-07 · 2026-09-08 · Flat and tonal.** No shadows, glows, gradients or
  glass. Depth comes from `page` → `surface` → `card`. The player's progress
  bar is the only gradient, and it is a hard two-colour stop showing real
  progress. Source: handoff hard rules.
- **D-08 · 2026-09-08 · Still controls.** Controls never translate or scale on
  hover; state changes colour or fill. Source: handoff hard rules.
- **D-09 · 2026-09-08 · Broadcast dock.** The persistent player keeps its deep
  indigo surface in both appearances, with a green play control and 44px
  targets. Source: owner request recorded in the design audit.
- **D-10 · 2026-09-08 · Dark geometry.** The dark appearance uses a softer
  card radius (12px against 6px) and a wider side gutter. Source: handoff.
- **D-11 · 2026-09-08 · Appearance switch in the menu.** The only appearance
  control lives inside the site menu, with the brand's half-disc mark, not a
  sun-and-moon toggle. Source: owner request recorded in the design audit.
- **D-12 · 2026-10-29 · A governed design system.** Token values live only in
  `libs/design-tokens/src/web.ts`; `tokens.css` is generated; the older
  variable names became aliases of tokens with identical rendered values
  (verified by computed-style comparison across 24 pages, both appearances,
  desktop and 390px). `pnpm design:check` runs in CI and blocks new
  hard-coded values. Source: owner request to make design changes deliberate
  and shareable between Claude Code and Codex.
- **D-13 · 2026-10-29 · Dead layers removed.** `app/globals.css` (never
  imported), the unused `IBM Plex Sans Arabic` `@font-face` rules and the
  overridden `:root` values in `listener.css` were deleted. Nothing rendered
  changed.

## Open questions for the owner

These are inconsistencies found while building the system. Each is a visible
change, however small, so none was made without a decision. Resolve one by
replying with the option, then record it above.

- **Q-01 · Two dark reds.** Public form errors use `#ff7775` and account form
  errors `#ff8583` in the dark appearance (`--mk-danger` vs
  `--mk-danger-text`). Option: use one red for both.
- **Q-02 · Unused account backdrop.** `customer.css` sets the dialog backdrop
  to 55% black, but `handoff.css` overrides it to 50% (`--mk-scrim`).
  Option: delete the dead 55% rule and the `--mk-scrim-account` token.
- **Q-03 · Off-scale type sizes.** 11, 19, 21, 22, 23, 28 and 42px appear
  outside the type scale, and display headings use about fifteen different
  `clamp()` values. Option: snap each to the nearest step and define two or
  three display sizes.
- **Q-04 · Too many breakpoints.** Besides the five canonical widths the CSS
  uses 380, 400, 430, 520, 620, 700, 721, 760, 800, 900, 1100 and 1400px.
  Option: move each to the nearest canonical width, checking each screen.
- **Q-05 · Duplicate action recipes.** Several classes implement the primary
  action with slightly different height, padding and weight (see
  [COMPONENTS.md](COMPONENTS.md#duplicates-to-resolve)). Option: one primary
  action recipe with documented sizes.
- **Q-06 · Raw radii.** 4, 6, 9, 12, 14 and 18px radii remain beside the
  radius tokens. Option: map each to card, control, media or dialog.
- **Q-08 · Ten silent cascade defects.** States that are declared but never
  apply, such as the password text running under the show/hide button in the
  account dialog and the home newsletter showing no invalid border (full list
  in [COMPONENTS.md](COMPONENTS.md#known-defects-from-the-audit)). Option: fix
  them as conformance fixes, checking each screen.
- **Q-09 · Dead CSS and components.** Unused rules and components listed in
  [COMPONENTS.md](COMPONENTS.md#dead-code). Option: delete them in one change,
  proven unchanged with `style-snapshot.js`.
- **Q-07 · Studio and native.** `apps/admin` and the native app use the older
  palette in `libs/design-tokens/src/color.ts`. Option: bring them under this
  system as separate adapters.
