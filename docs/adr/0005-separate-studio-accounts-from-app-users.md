# ADR 0005: Separate Studio accounts from application users

- Status: Accepted
- Date: 2026-08-17
- Decision owner: Product owner

## Context

The platform originally stored listeners, subscribers, editors, and
administrators in one `public.users` table. A role change could therefore turn
an application listener into a Studio operator, while the same record still
owned subscriptions, follows, and playback progress. The access directory also
displayed application users beside Studio operators.

The product owner clarified that these are different domains. Listeners and
subscribers use the public application. Studio accounts operate the internal
administration product.

## Decision

Studio membership and application membership are independent:

- `public.users` stores application users only. Subscriptions, follows, and
  playback progress continue to reference this table.
- `public.studio_members` stores Studio accounts only. Dynamic Studio roles,
  permission resolution, invitations, role assignment, and access audits
  reference this table.
- `listener` is not a Studio role and cannot be assigned through the Studio
  access directory.
- `/studio/me` resolves the authenticated Studio member and effective
  permissions.
- `/studio-members` lists, invites, and updates Studio accounts.
- `/me` and the listener endpoints resolve only application users.
- There is no endpoint that promotes an application user into the Studio or
  demotes a Studio member into an application user.

A Supabase Auth identity may be linked independently to both records when the
same person genuinely uses both products. Possessing an application profile
alone never grants Studio access.

## Studio interface

The existing browser routes remain stable, but their meaning is explicit:

- `/users` is the `حسابات الاستوديو` directory.
- `/users/new` creates a Studio account and assigns a Studio role.
- `/subscribers` contains application users and subscription operations.

Role counts report assigned Studio accounts only. Application users never
appear in the role directory or role selectors.

## Security invariants

- Studio middleware resolves `studio_members` by the verified Supabase Auth
  UUID before evaluating permissions.
- Application middleware resolves `users` separately for listener features.
- Studio content, billing administration, roles, and access routes reject an
  Auth identity that has only an application profile.
- Application subscription, follow, and playback routes reject an identity
  that has only a Studio membership.
- The protected administrator and final-administrator rules apply only within
  `studio_members`.
- Service-role credentials and Auth UUIDs remain server-only.

## Consequences

- The access directory can no longer convert a listener or subscriber into a
  Studio operator.
- Creating a Studio account does not create an application profile or a
  subscription record.
- Production deployment must apply migration
  `0009_separate_studio_members.sql` after migration
  `0008_dynamic_studio_roles.sql`.
- The local fixture keeps both collections separately so the meeting build
  demonstrates the same boundary.
