# ADR 0004: Dynamic Studio roles

- Status: Accepted; identity boundary superseded by ADR 0005
- Date: 2026-08-17
- Decision owner: Product owner

## Context

The original Studio authorization model seeded `admin`, `editor`, and
`listener` as a closed set. The product now requires administrators to create
additional roles and review each role's page permissions on a dedicated page.

ADR 0005 later removed `listener` from the Studio domain. It remains an
application-user concept only.

## Decision

Role identifiers are server-owned strings. The Studio roles `admin` and
`editor` are system seeds, not an allow-list. The Studio exposes:

- `/roles` for the role directory.
- `/roles/new` for role creation.
- `/roles/:roleId` for one role's permissions.
- `/users` and `/users/new` for assigning any existing role to a Studio account.

Each role stores a display name, description, system and protection flags,
permission set, assigned Studio-account count, and timestamps. Page permissions
retain the levels defined in ADR 0003: no access, view, and manage. A manage
permission requires the matching view permission.

## Protected role

`admin` remains the protected owner role. Its complete permission set is
immutable. Only an administrator may assign or remove that protected role.
Self-role changes and removal of the final administrator remain prohibited.
Custom roles may receive `access.view` and `access.manage`, but those
permissions do not make the role equivalent to the protected owner.

## Persistence and enforcement

Postgres stores roles in `studio_roles`; Studio-member and permission records
reference the dynamic role ID. Hono resolves permissions from the stored role
on every authenticated Studio request and remains the authorization boundary.
Role creation, permission changes, Studio-member role changes, and invitations
use locked database operations and append audit records.

The local fixture implements the same role and permission rules for the meeting
build. Fixture data is intentionally process-local and resets when the page is
fully reloaded.

## Consequences

- The number of roles is not limited by the application contract.
- A role is browsed and edited independently instead of occupying a fixed
  matrix column.
- Studio-account selectors are populated from the role directory, not a
  compiled enum.
- Production deployment must apply migration
  `0008_dynamic_studio_roles.sql` before releasing the updated API and Studio.
