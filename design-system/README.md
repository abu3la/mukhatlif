# Mukhtalif design system

The design system for the public website (`apps/web`): the tokens, components
and rules that every change to the site's appearance goes through, so the site
changes by deliberate choice rather than by one-off edits.

It is written for people and for coding agents alike. Claude Code and Codex
both reach it through the repository's `AGENTS.md`; there are no
agent-specific copies.

**Scope.** The public site and listener account pages in `apps/web`. The
Studio (`apps/admin`) and the native app keep their own palette in
`libs/design-tokens/src/color.ts` and are not governed here yet.

## بالعربي: كيف تطلب تعديلاً على التصميم

كل ما يظهر في الموقع مبني من **توكنز** (قيم مسمّاة للألوان والخطوط والمسافات
والزوايا) و**مكوّنات** (أزرار، بطاقات، حقول…). لكي يكون التعديل اختياراً
واعياً لا تعديلاً عشوائياً، صِف ما تريد بهذا الشكل:

```text
التعديل: (مثلاً: لون بطاقات الحلقات أفتح قليلاً في المظهر الداكن)
النطاق: كل الموقع / صفحة معيّنة / مكوّن معيّن
المظهر: الفاتح / الداكن / الاثنان
المرجع: رابط الصفحة أو لقطة شاشة
```

يحدد الوكيل (Claude أو Codex) مستوى التعديل قبل التنفيذ:

1. **قيمة توكن**: يتغيّر في كل مكان يستخدم التوكن (مثل `--mk-card`).
2. **وصفة مكوّن**: يتغيّر مكوّن واحد فقط (مثل حجم عنوان البطاقة).
3. **نمط جديد**: شيء غير موجود في النظام؛ يعرض عليك اقتراحاً أولاً ولا ينفّذ قبل موافقتك.

لرؤية كل التوكنز والمكوّنات حيّة بالمظهرين، شغّل الموقع محلياً وافتح
`/design-system` (الصفحة مخفية في الموقع العام المفهرس).

## Files

| File                                                                    | What it holds                                                                                                |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [TOKENS.md](TOKENS.md)                                                  | Every token with its light and dark value, role and Arabic name; the legacy alias map. Tables are generated. |
| [COMPONENTS.md](COMPONENTS.md)                                          | Each UI role (actions, fields, cards, states …), the exact class or component that owns it, and its states.  |
| [PATTERNS.md](PATTERNS.md)                                              | Page structure, layout, RTL, responsive widths, loading and empty states, motion, imagery.                   |
| [DESIGN_LAW.md](DESIGN_LAW.md)                                          | The quality bar: what this brand never ships, and the final pre-handoff check.                               |
| [DECISIONS.md](DECISIONS.md)                                            | Dated design decisions, and open questions that need the owner.                                              |
| [guard-baseline.json](guard-baseline.json)                              | Generated. Hard-coded values still tracked per file.                                                         |
| [style-snapshot.js](style-snapshot.js)                                  | Browser tool that proves a refactor changed nothing on screen.                                               |
| [`libs/design-tokens/src/web.ts`](../libs/design-tokens/src/web.ts)     | **The token source.** The only place token values are edited.                                                |
| [`apps/web/src/app/tokens.css`](../apps/web/src/app/tokens.css)         | Generated CSS custom properties. Never edit by hand.                                                         |
| [`apps/web/src/app/design-system/`](../apps/web/src/app/design-system/) | The live reference page at `/design-system`.                                                                 |
| [`scripts/design-system.ts`](../scripts/design-system.ts)               | The build and guard tooling.                                                                                 |

## Rules for every UI change in `apps/web`

1. **Read first.** This file, then the [TOKENS.md](TOKENS.md) roles you will
   use, the [COMPONENTS.md](COMPONENTS.md) entry for the component you touch,
   and [PATTERNS.md](PATTERNS.md) for layout. State in one line which existing
   component or page you are extending.
2. **Tokens only.** Colour, type size, weight, line height, radius, spacing and
   motion come from `--mk-*` tokens (or the legacy alias the surrounding code
   already uses). No hex, `rgb()`, named colours, new font families, shadows
   or ad-hoc pixel sizes in new code.
3. **Reuse the recipe.** Use the component's existing class or React
   component. Do not override its fill, ink, border, radius, height or type at
   a call site to invent a variant; add the variant to the component itself
   (level 2) and document it.
4. **Classify the change** (below) before editing. Level 3 needs the owner's
   decision first.
5. **Verify** (below) and report what you actually checked.

The owner's explicit instruction always wins over these defaults. When an
instruction conflicts with a rule here, follow the instruction and record it
in [DECISIONS.md](DECISIONS.md).

## Change levels

| Level                   | Example                                                           | Where you edit                                                      | Approval                                                     |
| ----------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------ |
| 0. Conformance fix      | A component uses `--mk-surface` where its recipe says `--mk-card` | The component's CSS                                                 | None; mention it                                             |
| 1. Token value          | "Cards a little lighter in dark mode"                             | `web.ts`, then `pnpm design:build`                                  | The owner's request is the decision; add a DECISIONS.md line |
| 2. Component recipe     | "Bigger episode-card titles", a new button variant                | The component's owning CSS (see COMPONENTS.md)                      | The owner's request; update COMPONENTS.md                    |
| 3. New pattern or token | A new section layout, a new colour role, a new type step          | Propose first: closest existing reference, what is missing, options | **Owner decides before implementation**; then DECISIONS.md   |

Before a level 1 change, list the roles the token feeds (search
`var(--mk-name)` and its legacy alias in [TOKENS.md](TOKENS.md)) so the owner
knows everything that will move.

## Commands

```bash
pnpm design:build     # regenerate tokens.css, the error-page palette and TOKENS.md tables
pnpm design:check     # fail on drift, unknown --mk-* names, or new hard-coded values
pnpm design:baseline  # re-record tracked debt (only after it went down, or with owner approval)
```

`design:check` also runs in CI (`.github/workflows/verify.yml`), so the rules
hold whichever agent or person made the change.

## Verification before handoff

- `pnpm design:check` passes, plus the web type-check, lint and tests for the
  files you touched.
- Look at every changed screen in the browser in **both appearances** (the
  appearance switch is in the site menu) at **desktop and 390px**. Check
  contrast, clipping, RTL order, focus outlines and that every control you
  touched responds to a real click.
- For a level 1 change, also open `/design-system` and confirm the token and
  the components that use it.
- For a change that must not alter the look (a cleanup, moving values onto
  tokens, removing dead CSS), run [style-snapshot.js](style-snapshot.js)
  before and after; it must report no differences.
- Walk [DESIGN_LAW.md](DESIGN_LAW.md#final-check) before calling it done.
- Report the commands and what you looked at. Do not report checks you did
  not run.
