# ADR 0007: Public web application and the completed API surface

- Status: Accepted
- Date: 2026-08-20

## Context

ADR 0001 recorded that the API "must add pagination, search, aggregate counts,
guests, audit logs, and missing upload workflows before production activation of
all handoff screens". ADR 0002 recorded that "invite-link acceptance and initial
password setup are not yet implemented ... they must be completed and verified
before production invitations are enabled". The public listener site described in
the brief did not exist.

This ADR records how those gaps were closed and the contracts they introduced.

## List contracts

Paging is **opt-in and uniform** across every list endpoint.

- A request supplying neither `page` nor `perPage` receives the historical bare
  array.
- A request supplying either receives `{ items, pageInfo }`.
- `search` may be combined with either mode and never changes the shape.

One parameter therefore decides the response body, and every caller written
before paging existed keeps working without modification. `perPage` is capped at
100 and an out-of-range or non-numeric value is a 400 rather than a silent clamp,
so a client never believes it received a full page when it did not.

Search terms are escaped before they reach a PostgREST `or=` filter. The term is
interpolated into a comma-separated, parenthesised filter string, so an
unescaped comma or parenthesis would let a caller append filter clauses of their
own. LIKE wildcards are escaped as well.

## Guests

Guests are a Studio-managed editorial domain and are never an authentication
subject. `public.guests`, `public.guest_socials`, and `public.guest_appearances`
enable RLS and grant only `service_role`, so the browser continues to reach guest
data through Hono alone.

A guest may be created blank and completed later, so every editorial field is a
possibly-empty string rather than a nullable one, and the slug is server-owned
after creation. One social link per platform per guest is enforced by a unique
index rather than by a read-then-write check. Appearance linking is idempotent:
the composite primary key absorbs a repeat and the route answers 200 instead of
a conflict.

## Overview summary

`GET /studio/summary` requires `overview.view` and then gates each section on its
own page permission, **omitting** a section the caller may not read. Returning a
zeroed `audience` block instead would read as real revenue data to an editor who
is simply not permitted to see it.

## Invitation acceptance

A `studio_members` row is created the moment an invitation is sent, so before
this change an invitee who had never opened the email was indistinguishable from
an active operator. Migration `0015` adds an explicit `status` / `accepted_at`
lifecycle and backfills existing rows as active from their creation date.

`studio_members` remains `SELECT`-only for `service_role`, so acceptance runs in
a security-definer RPC under the same access-control advisory lock as every other
membership mutation, and appends its own audit record.

`GET /studio/invitations/me` and `POST /studio/invitations/accept` authenticate on
the verified Auth identity rather than on Studio permissions, because an invitee
holds none until acceptance. **The password is set through the Auth admin API
first and the membership is flipped second.** The reverse order could leave an
active member with no password and no way to sign in; this order leaves a
retryable pending row. Acceptance is one-time, so a replayed request cannot
reopen password setup on an established account.

## Episode audio

The R2 audio path previously stored whatever `Content-Type` the client sent and
echoed it back, which let an operator park active content on the API origin and
have it served from that origin. Uploads now accept only an allowlisted audio
media type, reject an encoded body, require `Content-Length`, and cap the request
at 512 MiB.

Audio is deliberately **not** decoded. A Worker cannot cheaply inspect a media
container and an episode is far too large to buffer, so safety comes from
constraining what may be stored and how it is served, not from validating bytes
the way article images are. R2's reported object size is compared against the
declared length and a mismatch deletes the object rather than linking a truncated
file. Delivery clamps the content type to the allowlist and always sets
`nosniff`, so an object written by the previous route cannot be reinterpreted.

The allowlist lives in `libs/types` because it is a cross-app contract: the Studio
must send a type the API will accept.

## Public web application

`apps/web` is a Next.js App Router application, Arabic-first and RTL-only.

- **Every read happens in a server component.** The browser never receives the
  API origin, a Supabase client, or any credential.
- The site calls the API **anonymously**, so the API's own permission checks
  decide what exists. A draft is not filtered out by the site; it is never
  returned to it.
- Article bodies render `contentHtml`, the HTML the Worker produced from
  validated editor JSON per ADR 0006. The site never renders markup that
  originated in a browser and never re-derives HTML from the editor document.
- `GET /home` exists so the landing page is one request rather than a three-way
  waterfall. Its projections drop the private R2 audio key, the episode lifecycle
  status, and article bodies.
- `PUBLIC_WEB_URL` is shared with the Worker. The Worker builds absolute article
  links into newsletters from that value and a sent email cannot be rewritten, so
  the two must name the same origin.
- When the API origin is absent the data layer calls `connection()` before
  failing, which opts the route into request-time rendering. A build without API
  access therefore cannot bake an error page into static output.

## Consequences

- Production deployment must apply migrations `0014_guests.sql` and
  `0015_studio_invitation_acceptance.sql`, in that order, after `0013`.
- `STUDIO_INVITE_REDIRECT_URL` must point at the Studio's invitation-acceptance
  page and be allowlisted in Supabase Auth.
- The Studio's own invitation-acceptance screen is the remaining client work; the
  API contract it needs is complete and tested.
- `apps/web` needs `MUKHTALIF_API_URL` and a `PUBLIC_WEB_URL` matching the
  Worker's. Deploying to Cloudflare additionally requires `@opennextjs/cloudflare`,
  which is not yet wired.
