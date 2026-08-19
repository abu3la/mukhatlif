# Mukhtalif Admin Studio

Arabic-first internal content and subscription operations application.

## Runtime modes

| Mode | Purpose | Persistence |
|---|---|---|
| `fixture` | Local UI development and deterministic review | In-memory for the current session |
| `hono` | Authenticated production data through the Hono API | Supabase through the API |

Fixture mode is explicit and must not be used as a production fallback.

## Structure

```text
src/
├── app/       # composition, routing, providers, error boundaries
├── data/      # application repository contract and adapters
├── features/  # page orchestration and feature-specific UI
├── lib/       # current admin domain/view models and deterministic rules
└── shared/    # brand and reusable UI without feature dependencies
```

The current `lib` models are a transitional admin view model used by the supplied design handoff. They remain isolated behind the data boundary while the Hono contracts are expanded for guests, timestamps, pagination, and dashboard aggregates.

## Configuration

Copy `.env.example` to `.env.local`.

- `VITE_ADMIN_DATA_SOURCE=fixture` selects the deterministic development adapter.
- `VITE_ADMIN_DATA_SOURCE=hono` selects the production API adapter.
- `VITE_API_URL` is the Hono API origin.
- `VITE_DEV_USER_ID` is accepted only for the explicit local API development flow.

Production also requires a Supabase browser session. Application records must not be read directly from Supabase.

Access administration is deliberately separated:

- `/roles` contains the page-permission matrix.
- `/users` contains Studio-account invitations, the Studio member directory,
  and Studio role assignment. Application users never appear there.
- `/subscribers` contains application users and subscription operations; it is
  separate from Studio administration identities.
- `/access` is a compatibility redirect to `/roles`.

## Commands

```bash
pnpm --filter @mukhtalif/admin dev
pnpm --filter @mukhtalif/admin type-check
pnpm --filter @mukhtalif/admin lint
pnpm --filter @mukhtalif/admin test
pnpm --filter @mukhtalif/admin build
```

## Production blockers

- invite-link acceptance and initial password setup
- apply the Supabase migrations and provision the first linked administrator
- guest, guest social, and episode appearance API vertical slices
- paginated list and search contracts
- dashboard aggregate endpoint
- binary episode-audio upload support
