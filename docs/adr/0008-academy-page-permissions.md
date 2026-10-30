# ADR 0008: Academy page permissions

- Status: Accepted
- Date: 2026-10-30
- Decision owner: Product owner

## Context

Academy management was restricted by role name: `/studio/courses` used
`requireAdmin`, and Studio showed the page only when `viewer.role === 'admin'`.
No custom role could reach it, even with every permission in the matrix.

Colleagues who only upload workshops therefore needed the protected `admin` role,
which also grants subscriber records, form submissions and access management. On
2026-10-30 `noaman@mukhtalif.net` and `production@mukhtalif.net` were invited as
administrators for this reason.

## Decision

The Academy joins the page-permission matrix from ADR 0003 as `courses`, with
`courses.view` and `courses.manage`.

| Level | Reads | Changes |
|---|---|---|
| No access | Nothing. The page is absent and the API returns 403. | Nothing |
| View | Courses, course details, learners and submissions | Nothing |
| Manage | Everything View reads | Saving, uploading and grading |

- Every non-GET request to `/studio/courses` requires `courses.manage`. A new write
  route is therefore protected by default.
- `editor` receives neither permission, so existing editors keep their current
  access.
- View is a real read-only page: the fields are disabled, sections stay expandable,
  and the actions that would be rejected are not shown.

Learner names, assignment answers and grading sit inside the Academy page. A role
that can manage the Academy can also read them. Splitting learner data into its
own permission is a separate decision.

## The protected role is complete in code

`admin` holds every permission by definition (ADR 0003). The Supabase repository
now returns the full vocabulary for it instead of reading `role_permissions`.

Migrations 0026 and 0027 deliberately seed no rows. The API that predates this
release throws on a permission value it does not know, so one `admin` row applied
before the release would fail every administrator request. With no seed, the
migrations are safe before or after the API release.

The stored `admin` rows are consequently not the complete list. That is expected;
code is the source of truth for this one role.

## Release order

1. Back up the database and Auth, then apply 0026 and 0027 (development first).
   Running API and Studio versions are unaffected: no stored row changes.
2. Merge. Main verification deploys the API, then Studio.
3. Between those two deployments the API returns the new permissions to the old
   Studio, which rejects unknown values, so **administrators see the Studio error
   screen until Studio finishes**. Recent releases took about 2 minutes. Editors are
   unaffected. If the Studio deployment fails, rerun it: administrators stay locked
   out of Studio until it succeeds. Merge when nobody is uploading.
4. Create the narrow role in `/roles/new` and move accounts to it in `/users`.

## Rollback

Studio and the API must roll back together, because the new Studio requires the
full vocabulary for an administrator.

Remove the Academy permissions from every custom role before rolling the API back.
The older API throws on those values for the role's members and for anyone listing
roles. The enum values and function changes in 0026 and 0027 can stay in place.

## Consequences

- A later permission can follow the same pattern without a lockout risk for
  administrators.
- `requireAdmin` had no remaining callers and was removed.
