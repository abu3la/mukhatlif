-- Link application profiles to immutable Supabase Auth identities and add the
-- least-privileged Studio editor role. Existing rows remain deliberately
-- unlinked until an operator verifies and assigns the correct Auth UUID.

alter type public.user_role add value if not exists 'editor' before 'admin';

alter table public.users
  add column auth_user_id uuid references auth.users (id) on delete set null;

create unique index users_auth_user_id_unique
  on public.users (auth_user_id)
  where auth_user_id is not null;

comment on column public.users.auth_user_id is
  'Verified immutable Supabase Auth identity. Runtime email matching is forbidden.';
