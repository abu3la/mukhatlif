# ADR 0002: Admin Studio authentication and access management

- Status: Superseded by ADR 0005
- Date: 2026-08-16
- Decision owner: Product owner

## Context

The Admin Studio needs a local meeting-ready sign-in flow and a production-safe
path to Supabase Auth. The platform already stores listener profiles in the
`users` table, and the Hono API is the only application-data boundary because
its Supabase client uses a server credential.

The implementation must not infer production safety from missing environment
variables, trust browser metadata for authorization, or let an editor request
subscriber records that the role cannot access.

## Decision

Authentication and authorization are separate concerns:

1. Supabase Auth verifies the browser session in production.
2. Hono resolves the verified Auth UUID to a linked platform profile.
3. The profile role stored in Postgres determines the effective permissions.
4. The browser uses `/me` only to render the authorized experience. It is not
   the enforcement boundary.

The role model is deliberately small:

| Role | Studio access | Content | Subscribers | Access management |
|---|---:|---:|---:|---:|
| `listener` | No | No | No | No |
| `editor` | Yes | Read and write | No | No |
| `admin` | Yes | Read and write | Read and write | Read and write |

Access management is split into two administrator-only screens:

- `/roles` defines the page-permission matrix for each editable role.
- `/users` invites new users, lists the current directory, and assigns roles.

The legacy `/access` path redirects to `/roles` so bookmarked links remain safe.
New production users are invited through a server-only Hono endpoint. The
browser submits only the display name, email, role, and interface locale; it
never receives Supabase administrator credentials or supplies a password or
Auth UUID.

## Identity binding

- `public.users.auth_user_id` stores the immutable Supabase Auth UUID.
- Authorization resolution uses only the verified Auth UUID. Email is not an
  authorization key and is never used as a fallback.
- The API returns an `authLinked` boolean to administrators. It never returns
  the Auth UUID.
- Promoting an unlinked profile to `editor` or `admin` is rejected.

## Lockout and audit rules

- A user cannot change their own role through the general role endpoint.
- The final administrator cannot be demoted.
- The Postgres role-change operation locks the relevant records, performs the
  validation, changes the role, and appends the audit record atomically.
- Audit records are append-only and are not exposed to anonymous or regular
  authenticated database clients.
- A new user invitation links the immutable Auth UUID and creates the platform
  profile in one database transaction, then appends a `user.invited` audit
  record.
- Duplicate emails are checked before an invitation is sent and again inside
  the locked database operation. Ambiguous provisioning failures are surfaced
  for administrator review instead of being retried automatically.

## User invitation boundary

- `POST /users` is restricted to administrators and validates a strict
  `{ displayName, email, role, locale }` body.
- Supabase Auth invitations are sent only by the Hono API with the service-role
  credential. The Vite bundle never contains that credential.
- `STUDIO_INVITE_REDIRECT_URL` must be an approved absolute URL. It must use
  HTTPS outside local development and must also be allowlisted in Supabase
  Auth.
- The local fixture mirrors creation and duplicate-email behavior without
  sending email, which keeps the meeting demo deterministic.

## Runtime modes

| Mode | Identity source | Data source | Requirement |
|---|---|---|---|
| Local fixture | Explicit fixture session | In-process fixture repository | Development only |
| Local Hono | Supabase browser session | Local Hono API | Supabase browser and server credentials |
| Production | Supabase browser session | Deployed Hono API | Complete configuration; fail closed otherwise |

The `x-dev-user` header and memory repository are available only when
`APP_ENV=development` and `ALLOW_DEV_AUTH=true`. Missing or partial Supabase
server configuration never activates development access implicitly.

## Frontend boundaries

- Public authentication routes mount before any Studio data provider.
- The authenticated viewer is loaded separately from content and billing data.
- Editors load the content workspace only.
- Administrators load the subscriber directory only inside administrator
  routes.
- Signing out or changing accounts clears the TanStack Query cache.
- Supabase service credentials are never present in the Vite application.

## Consequences

- A real production administrator must first exist in Supabase Auth and have
  that exact Auth UUID linked to the platform profile.
- Role changes take effect at the API on the next request, independently of
  what the navigation currently displays.
- Production rollout requires migration `0007_studio_user_invitations.sql`,
  configured Supabase SMTP/invitation templates, and the Worker invitation
  redirect setting.
- Invite-link acceptance and initial password setup are not yet implemented in
  the Admin Studio. They must be completed and verified before production
  invitations are enabled.
- MFA policy, session revocation, and an audit-log viewer remain later
  production work.
