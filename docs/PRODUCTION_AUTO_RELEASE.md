# Automatic production delivery, 8 September 2026

Owner authorization: publish now through GitHub, limited to API, Studio and staging.
Root WordPress and DNS remain unchanged. Main verification triggers API delivery;
only successful API delivery triggers the two existing frontend workflows.
The API bundle uses the existing Node 22/Hostinger adapter, carries an exact
source commit in `/health/live`, checks production environment on build and start,
and verifies customer schema plus unauthenticated 401s before consumers deploy.
The first API rollback is the verified September 5 local archive; subsequent
releases require a non-expired GitHub source artifact for the live commit.

Production database backup and roles are private outside Git at
`/Users/abu3la/mukhtalif/backups/mukhtalif-production-backup-pn1d4bl9/`.
The custom archive index was read successfully; full restore was not rehearsed.
Migration 0024 and ledger insert ran atomically; both tables are empty with RLS,
and existing episodes/articles/application users/Auth users fingerprints match.
Credentials are absent from the repository and from release artifacts.

Staging runtime configuration adds the production public Supabase key from the
existing GitHub secret. It accepts only the documented staging variable names,
refusing to overwrite unknown provider settings. API secrets stay in Hostinger.
The GitHub deployment token remains the existing repository secret.
