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
- **D-14 · 2026-10-31 · Internal reference page.** `/design-system` opens only
  under `next dev` and on the development Worker. Staging, the live site and any
  unknown host show the not-found page, with no page content or title. Source:
  owner request that customers never reach it.

- **D-15 · 2026-11-07 · Academy and forms CSS recorded as debt.** `dev` gained
  the Academy (courses), registration-form, upload-progress and busy-button
  styles after this system was branched, so the guard had never seen them. On
  merge their hard-coded values were recorded in `guard-baseline.json` (954
  tracked values, up from 746) instead of converted, because converting them
  changes what renders on screens nobody had checked. Source: the owner's merge
  request; the conversion is Q-10.

- **D-16 · 2026-11-07 · One filled action, one disabled state.** Every filled
  primary action renders as the `.public-primary` pill (52px, semibold,
  tonal hover) whatever class the markup still carries: request-form and
  guest-search submits, the newsletter submit, `.action`, dialog submits, the
  follow button, the Academy `.course-button` and the menu's sponsor link. The
  pager keeps the pill at 44px. Disabled is a solid tonal step (10% ink fill,
  70% ink label), never a faded button. Text actions share one size (14px,
  control radius). Focus rings inside the header and main are 3px ink. Source:
  the owner's request to fix the site's buttons everywhere; resolves Q-05
  items 1, 2 and 10 and Q-08 items 1 to 8 and 10.
- **D-17 · 2026-11-07 · The guest hero is tonal.** `/guests` opened with a
  broadcast-indigo panel on which the light-mode lede was unreadable (2.5:1),
  and which collided with the warm dark page. It now sits on `surface` with
  ink text, like every other section; the portrait placeholder uses `card`.
  Source: DESIGN_LAW, no colour seams outside the footer and the player.
- **D-18 · 2026-11-07 · «حصري» is not green.** The exclusive label on
  programme and episode cards used the green ink (2.9:1 on the dark page).
  It is muted ink now; green stays with playback. Source: D-04.
- **D-19 · 2026-11-07 · Legacy error pages stay script-free.** The static 404
  and 503 pages for old URLs cannot read the stored appearance without a
  script, and their test requires that they carry none, so they keep following
  the device colour scheme. Their primary action hovers tonally like every
  other. Matching the stored choice is Q-11.
- **D-20 · 2026-11-07 · Touch targets and hovers.** "See all" links, footer
  links and the footer email, the pager, the account form link and the guest
  breadcrumb reach 44px; filter tabs, the home newsletter fields and the
  request-form fields show their hover, focus and invalid borders; the footer
  folds to two columns up to 820px. The articles index uses the shared page
  head. The Academy catalogue reports a failed load in Arabic.
- **D-21 · 2026-11-07 · The Studio joins the system.** `apps/admin` gets its
  own token source (`libs/design-tokens/src/studio.ts`, `--st-*`), a generated
  sheet (`00-tokens.css`) imported first, legacy aliases (`--ink`, `--canvas` …)
  pointing at the tokens, and the same guard and ratchet baseline. Its 1,000-odd
  existing hard-coded values were recorded as debt rather than converted
  (Q-13), except in the shell, shared-controls and base sheets, which were
  converted while being redesigned. Reference: [STUDIO.md](STUDIO.md). Source:
  the owner's request to establish a design system for the dashboard.
- **D-22 · 2026-11-07 · One hue per Studio domain.** The owner asked for more
  colour in the dashboard. It arrives as eight domain hues (episodes indigo,
  programmes teal, guests terracotta, articles wine, academy green, audience
  moss, requests ochre, access slate) used tonally: a tint behind, a dark ink
  on it, a mid tone for the mark. They sign the sidebar, page heads, overview
  cards, filter rails and status chips; buttons stay ink; the canvas is tinted
  toward the brand indigo (`#eceef7`) so cards need only a self-coloured edge.
  Status chips moved from solid fills with white text to tint-and-ink pairs.
  `muted` darkened to `#5f6389` so metadata passes 4.5:1 on the canvas.
- **D-23 · 2026-11-07 · Studio UX.** The sidebar is grouped (المحتوى, الجمهور,
  الإدارة) with the overview first and each item signed by its domain mark;
  the overview shows six linked count cards and a «يحتاج متابعة» list of
  scheduled episodes and drafts beside the latest published episodes; list rows
  light up edge to edge on hover; every control (buttons, nav, filter rail,
  breadcrumb, switch, text links) reaches 44px; disabled is a solid tonal step;
  focus rings are ink, not green (D-04); metadata is spaced, not dotted (the
  owner's standing rule). The avatar is ink with an on-ink initial.

- **D-24 · 2026-11-20 · The presentation site (direction C).** The owner chose
  the third direction of the redesign canvas
  (https://claude.ai/artifact/44WWRh2CUhAHRiw1CsEpDS): the site introduces
  Mukhtalif before it plays media. Built on the home, the header, the footer,
  the programme, community, episode, articles, article and newsletter pages,
  then «استمع», search, «مكتبتي» and the sign-in pages, and on 24 November
  (the owner: «ابني كل شي») every remaining page.
  - **The night stage, the sheet, the floor.** A page may open on a night stage
    (`--mk-stage*`: indigo night in light, the footer's green-black in dark),
    continue on a white sheet whose rounded top (`--mk-radius-sheet`) slides
    over it, and end on the footer's floor. The sheet's edge is the boundary,
    so these are deliberate breaks, not seams (an exception to D-06's single
    floor and to "sections are separated by space").
  - **The maze is the brand pattern.** The rounded-line pattern becomes a real
    maze (`lib/maze.ts`, fixed seeds in `lib/home-maze.ts`, tested). One route
    starts at the diamond full stop of «لمسار مهني يشبهك» and runs down the
    page; «أي مسار يشبهك؟» draws a route to each community. Routes are always
    drawn as a faint trace; the ink draws itself over it once
    (`--mk-duration-route`, `--mk-duration-pick`), so nothing depends on
    motion. The hero is one drawing that scales as a unit (`--u`), the one
    place layout uses physical geometry.
  - **The home tells the story** in order: hero, «قضيتنا» lit phrase by phrase
    (`--mk-stage-ink-unlit` keeps unlit phrases readable), the 2023-to-today
    stops, a programmes rail, the community picker (slides on phones and
    tablets), the general newsletter (kept: it is the site's only signup),
    production, the team as credits. Listening starts from «استمع» in the
    header (`/episodes`) and from every programme.
  - **A programme page stands on its cover.** Each programme has a ground
    sampled from its cover's edge and an accent from its lettering
    (`--mk-cover-<slug>-*`, tested for contrast); all other text on the cover
    is one ink per tone. The cover is the title (Petroly uses its calligraphy
    cut onto black, `public/communities/programmes/marks`). The count is the
    page's one large number (`--mk-display-numeral`). The latest twelve
    episodes are a rail; older pages redirect to `/episodes?showId=…`.
  - **A community page is where the home's route arrives.** The route enters
    the maze through the gap between the nav and the logo (phones: the right
    edge) and ends at the full stop of the community's name
    (`ARRIVAL_WIDE`/`ARRIVAL_PHONE`; each name's measured width,
    `COMMUNITY_NAME_EM`, keeps it centred; tested). The stage says what the
    community holds in words («تسعة برامج ونشرتان», `countInWords`), then the
    sheet shows its programmes whole, three to a row, its latest episodes,
    its newsletters two-up and the other communities.
  - **An episode stands on its programme's cover** (the night stage for a show
    outside the 27). The video is embedded from the start, as before, and
    crosses onto the sheet by a quarter of its width (`.has-cross`,
    `.stage-cross`); its «مشاهدة الحلقة» heading stays for screen readers.
    Listening starts from the player's own pill (`PlayEpisodeButton`), whose
    bar then carries the timeline, so the page no longer repeats an inline
    player. Facts are spaced with a bare clock icon, never dotted. The notes
    are read at the article measure; moments, more episodes and the
    programme's newsletter follow.
  - **Reading pages.** The articles index and an article stand on the night
    stage; the newest article's cover (or the article's own) crosses onto the
    sheet. Search, pages, the newsletters and the topics stay. An article is
    read one step up the scale (`--mk-text-2xl`; «كبّر النص» still enlarges
    it); its byline is plain text (the initial in a circle is gone); more
    reading, the latest episodes and the general newsletter follow. A
    newsletter page stands on its programme's cover with the programme's mark
    or cover (the general one on the night stage); subscription still happens
    on each list's current page.
  - **Indexes and the account (third round, canvas version 21).** «استمع»
    stands on the night stage with the catalogue in a fact («847 حلقة من 16
    برنامجًا»); the newest episode's large still crosses onto the sheet, where
    it is introduced, then the whole catalogue: the programmes as their own
    covers to choose from (the select is gone), a search, the order as words
    and the pages. Each choice reloads the list at `#all`. Search asks its
    question on the stage with the kinds of result and their counts at its
    edge (a kind with nothing is muted, all of them hidden when nothing is
    found); answers follow by kind, programmes from the 27 of the
    communities, guests by name and role without initials. «مكتبتي» keeps its
    stage while the account loads: the episode the listener stopped in crosses
    with how far they got, then saves, follows, playlists (four stills),
    moments with «استمع من هنا» and saved reading; each full list
    («سجل الاستماع», «اهتماماتي»…) is its own view under the same stage, so
    the tab strip is gone. The sign-in pages stand on the maze: the route
    arrives at the diamond above the form (`lib/auth-maze.ts`, tested to stay
    clear of the form at every wide size); on phones the form is the sheet.
    The password field says «إظهار» and «إخفاء» instead of drawing an eye.
  - **Everything else (fifth round, from canvas version 23).** «البرامج»: every
    cover drifts across the stage's edge onto the sheet (one seamless loop that
    stops while pointed at and holds still with reduced motion); the directory
    runs community by community in one grid, each community opening with a
    night tile where a route arrives at its name (`lib/directory-maze.ts`, a
    seed per community), and a chooser keeps one community. «المجتمعات»: the
    stage is a map; every route leaves the title's full stop and arrives at a
    community's name, and the pointed or focused name draws its way
    (`lib/map-maze.ts`, the most direct seed; the title is part of the drawing
    on wide screens); the sheet is the map's legend in the same order.
    «الإنتاج»: the page is the brief's first step; the three forms are a radio
    group in large type and the chosen one's route walks the maze to «تابع إلى
    الطلب», which carries the choice to the form (`lib/brief-maze.ts`).
    «الأكاديمية»: a course has no artwork, so its cover is drawn from its data
    (skill, title, one stop per lesson) and crosses onto the sheet, where the
    first course with a description is introduced with its price and one
    action; «كيف تتعلّم» climbs as a staircase. The course page stands the same
    cover on its stage and keeps the learning workspace's rules. The five request
    forms stand on the sign-in stage, where the route arrives at the form.
    «من نحن» and «قضيتنا» retell the home's pieces around their own text;
    presenters read as closing credits; guests, work, contact and the legal
    pages take the index stage; «حسابي», «دوراتي», a playlist and the loading
    placeholders take the stage and the sheet. The wide drawings run past their
    frame, so wider screens see more maze; phones and tablets get a composition
    anchored to the right edge. Seeds are tested (`lib/menu-mazes.test.ts`).
  - **Header and footer.** The bar gains «البرامج» and «الإنتاج», «قضيتنا»
    joins «عن مختلف», and «استمع» is the bar's one filled action; search,
    «مكتبتي» and the menu stay as the owner's rules require. Over a stage the
    bar is transparent and takes the stage's ink. The footer floor carries
    four link groups, the platform marks and the wordmark at the bottom edge.
  - **Type and space.** Display sizes `--mk-display-1`, `-2`, `-numeral`, and
    `--mk-section` for the room between stage sections (part of Q-03).
  - **Kept out:** decorative arrows on text links (they were removed on
    purpose); presenter photos that are not confirmed (only Ahmed Attar's
    portrait is used); the sentence on Petroly's KFUPM origin, which waits for
    the owner's confirmation.
  - Now unused and left for Q-09: `WeeklyEpisodeCard`, `LatestEpisodeAction`,
    `ListeningPlatforms`, `ContinueListening`, `CommunityCard`'s rail use, and
    the older `.home-*` rules in `listener.css`; since the second round,
    `CommunityCrate`, `InlineEpisodePlayer` and the rules for
    `.community-head`, `.episode-detail__*`, `.public-episode-detail`,
    `.article-detail__header`, `.article-author*` and `.newsletter-landing*`;
    since the third round, the `.customer-library-tabs`,
    `.customer-auth-layout`, `.customer-auth-context`, `.customer-auth-perks`,
    `.customer-auth-mark` and `.customer-form-panel` rules.

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
- **Q-05 · Duplicate recipes.** The filled actions, text actions and focus
  rings converged in D-16. Icon buttons, fields, dialog shells, card
  containers, the two `GuestCard` recipes, the two tab patterns and the page
  heads still differ (see [COMPONENTS.md](COMPONENTS.md#duplicates-to-resolve)).
  Option: converge them one role at a time.
- **Q-06 · Raw radii.** 4, 6, 9, 12, 14 and 18px radii remain beside the
  radius tokens. Option: map each to card, control, media or dialog.
- **Q-08 · One cascade defect left.** Nine of the ten silenced states were
  restored in D-16 and D-20. In the dark appearance the episode-card play
  button still hovers to `ink-hover` rather than the dock's green; it is a
  tonal hover on a light control and may be intended. Option: keep it, or
  make it green to match the dock.
- **Q-09 · Dead CSS and components.** Unused rules and components listed in
  [COMPONENTS.md](COMPONENTS.md#dead-code). Option: delete them in one change,
  proven unchanged with `style-snapshot.js`.
- **Q-07 · Studio and native.** `apps/admin` and the native app use the older
  palette in `libs/design-tokens/src/color.ts`. Option: bring them under this
  system as separate adapters.
- **Q-10 · Academy and forms outside the system.** `courses.css`,
  `registration.css`, `upload-progress.css` and `busy-button.css` carry 27 raw
  colours, two shadows, three `!important`s, a font-family of their own, twelve
  off-canonical breakpoints and their own type, radius and spacing values.
  Option: bring them under the tokens one file at a time, proving each screen
  with `style-snapshot.js` in both appearances.
- **Q-11 · Legacy error pages and the stored appearance.** The static 404 and
  503 pages for old URLs follow the device colour scheme (D-19), so a visitor
  who chose the dark appearance on a light device sees a white page there.
  Option: mirror the choice into a cookie the route can read, or accept the
  difference on those pages.
- **Q-12 · Studio dark appearance.** The Studio has one appearance. Option:
  add a dark set of `--st-*` values and the menu switch the public site uses,
  or keep the dashboard light.
- **Q-13 · Studio legacy debt.** The feature sheets `04` to `12`,
  `courses.css`, `registration.css` and `upload-progress.css` carry about a
  thousand hard-coded values recorded in `guard-baseline.json` (D-21). Option:
  convert one sheet at a time, proving each screen with before/after
  screenshots.
