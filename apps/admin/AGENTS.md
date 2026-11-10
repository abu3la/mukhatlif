# Design system

UI changes in the Studio follow `../../design-system/STUDIO.md` (and the
shared rules in `../../design-system/README.md`): tokens from
`libs/design-tokens/src/studio.ts` (`pnpm design:build` regenerates
`src/app/styles/00-tokens.css`), the component recipes in STUDIO.md, and
`pnpm design:check` before handoff. New CSS uses `var(--st-…)` or the legacy
alias the surrounding file already uses; never a raw colour or size.

Run the Studio against fixture data (no Supabase) with
`VITE_ADMIN_DATA_SOURCE=fixture` in `.env.local`; the login page offers the
demo accounts.
