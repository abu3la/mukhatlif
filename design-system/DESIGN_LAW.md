# Design law

The quality bar for the Mukhtalif site. It condenses the owner's standing
anti-template rules into what applies to this brand, so every contributor and
agent works to the same bar. Read it before designing; walk the
[final check](#final-check) before handing off. The owner's explicit
instruction overrides any line here.

## What makes the site look like Mukhtalif

- **One Arabic voice.** IBM Plex Sans Arabic (served as `Mukhtalif`) in four
  weights is the only family. Hierarchy comes from size and weight, never from
  a second face, a mono "label" voice or decorative tracking.
- **Ink on paper, and a warm night.** Indigo ink on white in the light
  appearance; a warm green-black, not a blue slate, in the dark one. Both are
  tonal: depth comes from `page` → `surface` → `card`, not from shadows.
- **Green means on air.** The station green belongs to playback. It is not an
  accent for headings, links, badges or decoration.
- **The programmes are the art.** Real programme covers, episode artwork and
  the brand mark carry the visual identity. Nothing is invented to fill space.
- **The broadcast dock.** The player keeps its own deep indigo world in both
  appearances; it is the one place the broadcast palette lives.
- **Arabic first.** RTL is the layout the site is written for. Logical
  properties only; Latin runs (times, emails, URLs) are isolated.

## Never ship

### Type and copy

- A second font family, a trendy display face, or mono used as a house voice.
- Gradient-filled text, letter-spaced caps labels, negative tracking that
  crushes Arabic letterforms.
- Headlines that stack into three or more short lines; a lone accent word.
- Em dashes in UI copy. Use plain Arabic punctuation (the `ux-araby`
  guidance governs microcopy).
- Invented numbers, testimonials, customers or claims. Copy is terse and true.

### Colour and surfaces

- Hex, `rgb()` or named colours in components. Every colour is a token.
- Blue-to-purple or candy gradients, glows, radial halos, background blobs.
- Saturated accent colour sprayed on type, dots and buttons. Emphasis is a
  tonal step or a weight change.
- Shadows of any kind, including a duplicate box faking one. Glass effects.
- Grain or texture over readable content. Full-page grid or graph-paper
  backgrounds.
- The default UI-kit grey or a cream "editorial" sheet as a surface. Use the
  page, surface and card tokens.
- A hard colour seam between sections. Only the footer steps onto its own
  darker floor, by decision.

### Components and icons

- An icon or logo inside a tinted tile, chip or circle as decoration. Marks sit
  bare. (Round dock controls and dialog close buttons are interactive hit
  targets, not decoration.)
- Icon-pack filler, fake logos, gradient-initials avatars.
- Metadata wrapped in tinted pill chips everywhere. Rank information with type.
  Pills are reserved for primary actions and real filter choices.
- A filled button beside an outlined twin as the default action pair. One clear
  primary action; secondary actions are text actions.
- The kitchen-sink card (icon tile, category pill, tag row, divider, price,
  glowing button).
- Hover lift or scale on buttons, growing underlines, a dot under the active
  nav item. Hover changes colour or fill only.
- A sun-and-moon toggle. The appearance switch lives in the menu with the
  brand's own half-disc mark.
- A control that looks interactive but does nothing.

### Layout

- The generic SaaS stack (split hero, three feature tiles, pricing, FAQ,
  gradient CTA slab, four-column footer). Compose from the brand's content.
- Small-label-over-big-heading on every section; numbered steps on a rail.
- Ragged parallel grids: titles, metadata and actions of side-by-side cards
  must align; actions anchor to the bottom.
- Text against an edge. Use `--mk-gutter` and the container padding.
- Content cut by a clip, notch, `overflow: hidden` or a fixed height. Clear the
  cut and check the edge at full zoom.
- Off-centre content in buttons, round controls and badges. Centre with flex
  and check it, do not assume it.

### Motion

- Content that starts invisible and waits for an entrance animation. Content
  is visible by default; motion only moves what is already shown.
- Looping decorative motion (floating cards, bobbing tags, drifting blobs).
- Motion that ignores `prefers-reduced-motion`.

## Final check

Walk this list against every changed screen, in both appearances, at desktop
and 390px. Fix what fails before handoff.

1. Every new colour, size, weight, radius, space and duration is a token;
   `pnpm design:check` passes.
2. The component recipe is reused, not restyled at the call site.
3. Text contrast is clear on its actual background, including disabled,
   placeholder, error and on-ink labels.
4. Nothing is clipped: headings, descriptors, focus outlines, Arabic marks above
   and below the line.
5. Parallel items align; actions sit on a shared baseline.
6. Icons and labels are optically centred in their controls.
7. RTL order is right: reading order, rails start from the right, arrows point
   the correct way, Latin runs are isolated.
8. Every control responds to a real click and shows hover, focus-visible and
   disabled states. Touch targets are at least 44px.
9. Loading uses the existing skeletons with the loaded geometry; empty and
   error states use the existing state components.
10. No content depends on an animation to appear; reduced motion is honoured.
11. Copy is short, true and in natural Arabic; no em dashes.
12. Nothing on the "never ship" list crept in, including from a copied block.
