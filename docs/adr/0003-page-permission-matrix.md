# ADR 0003: Page-level Studio permission matrix

- Status: Superseded by ADR 0005
- Date: 2026-08-16
- Decision owner: Product owner

## Context

ADR 0002 introduced three account roles, but a role name alone is too coarse
for the Studio. Product owners must be able to decide which pages each role can
open and whether the role can only read the page or can also change its data.

The permission system must remain authoritative in Hono. Hiding a navigation
item or disabling a browser control is only presentation and cannot grant or
deny access by itself.

## Decision

The Studio keeps the roles `listener`, `editor`, and `admin`, then resolves each
role to a stored page-permission set on every authenticated API request.

Each configurable page has one of three effective levels:

| Level | Meaning |
|---|---|
| No access | The route is absent from navigation and direct access is denied. |
| View | The role can read the page data but cannot mutate it. |
| Manage | The role can read and mutate the page data. |

Permission identifiers are explicit strings owned by the shared contract:

| Page | View permission | Manage permission |
|---|---|---|
| Overview | `overview.view` | Not applicable |
| Episodes | `episodes.view` | `episodes.manage` |
| Shows | `shows.view` | `shows.manage` |
| Guests | `guests.view` | `guests.manage` |
| Articles | `articles.view` | `articles.manage` |
| Subscribers | `subscribers.view` | `subscribers.manage` |
| Access | `access.view` | `access.manage` |

`manage` always implies the corresponding `view` permission. The API rejects
malformed matrices rather than repairing them silently.

## Protected owner role

`admin` is the system-owner role. Its complete permission set is immutable.
Only an administrator may update the matrices for `editor` and `listener`.
The `access.view` and `access.manage` permissions are reserved for `admin` and
cannot be assigned to another role.

This invariant prevents a configurable matrix from removing every access
manager or allowing a role to grant itself additional permissions.

## Default matrices

- `admin`: every valid permission.
- `editor`: overview view plus view and manage for episodes, shows, guests, and
  articles.
- `listener`: no Studio permissions.

The defaults are bootstrap values only. Stored editor and listener matrices
become authoritative after migration.

## Enforcement

- `/me` returns the verified profile and its resolved permission identifiers.
- Hono read routes require the matching `.view` permission when accessing
  non-public Studio data.
- Hono mutation routes require the matching `.manage` permission.
- Public published-content endpoints keep their listener-facing behavior.
- Subscriber data is split from content data and requires subscriber
  permissions.
- Access-management and audit endpoints remain administrator-only.
- The Vite router, navigation, providers, and controls consume the same shared
  identifiers for a consistent experience, but Hono remains authoritative.

## Persistence and audit

Postgres stores one row per role and permission. Permission changes use one
transaction, validate the complete requested set, replace the role matrix, and
append an audit event containing the actor, target role, previous set, new set,
request ID, and timestamp.

The local fixture repository implements the same rules so the meeting build
does not demonstrate behavior that production would reject.

## Consequences

- A role change and a permission-matrix change are separate operations.
- A person can enter the Studio when their resolved matrix grants at least one
  page view permission, even if the role is `listener`.
- Direct URLs show a clear permission state instead of leaking page data.
- Production deployment must apply the page-permission migration before the
  updated API and Studio are released together.
