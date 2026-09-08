# Customer accounts: development database release

Migration `0024_customer_accounts_library.sql` adds private customer profile and library tables plus three service-role-only functions. It does not change Studio roles, memberships, publication data or existing customer records. New account provisioning is an explicit authenticated API call and independently checks the confirmed Supabase Auth identity.

Migration 0024 was **applied and verified on development** `acomtixjibgkauzeltsn` at `2026-09-08T07:28:10.883Z`. Supported Supabase CLI browser login restored database access; the earlier HTTP 403 and missing-schema observations are historical. Production `pacpdxvujkjvnaeeuute` was not changed. This receipt verifies the schema and existing-data preservation, not customer email delivery or hosted account acceptance.

## Verified development receipts

The existing 0023 YouTube column, its exact comment and validated constraint were verified before repairing its missing ledger entry. `supabase/verify-0023-existing.sql` performs the read-only comparison. The guarded transaction in `supabase/reconcile-0023-development-ledger.sql` then inserted only `0023_episode_youtube.sql` into `public.schema_migrations`; it did not rerun 0023 DDL or change episodes. The transaction requires the 0022 ledger prerequisite, refuses an existing 0023 entry and locks the ledger and episode table while checking their state. Use it only through an independently verified development connection; the SQL role check alone does not identify the project. This one-time repair is complete and must not be repeated.

- Before the ledger repair, a full database/Auth backup was verified at `/Users/abu3la/mukhtalif/backups/customer-dev-before-ledger-20260908/receipt.json`. The dump contains `1431117` bytes with SHA-256 `4084af953ed5b4218a84bca49ff643bba4085cddb4abfcb1bccf75115529204a`.
- A separate full database/Auth backup preceded 0024. `/Users/abu3la/mukhtalif/backups/customer-dev-0024-20260908/receipt.json` records `applied_and_verified` at the timestamp above, migration SHA-256 `1cd0cb196fa4f1d99034255b99f0b14ca83ac87f1df5e4c16a0650e7b1f59a32`, and dump SHA-256 `f4ab48374d969db27afb76f331d907fc872f9a6ecaec7edd504b648adaeecf13`.
- Verified unchanged counts were 1 Auth user, 0 customer users, 1 Studio member, 852 episodes, 59 articles, 0 follows, 0 progress rows and 0 subscriptions. Synthetic account smoke records were rolled back. Protected backups and receipts remain outside Git.

The migration and transaction/rollback behavior execute in the API test suite using an isolated PGlite PostgreSQL database containing the relevant current identity tables. `scripts/customer-postgres.test.mjs` runs the actual migration, release smoke transaction, browser-role denial and service-role identity checks. Run it with `pnpm --filter @mukhtalif/api test`; this validates SQL behavior, not hosted deployment. API identity, profile, library isolation and concurrent-write tests also pass.

## Reviewed apply procedure

The current development schema is already applied. Use the first command below for a repeat verification; the apply example documents the reviewed procedure for an unapplied schema and is not a request to apply it again.

Create a protected environment file outside Git containing `MUKHTALIF_DEVELOPMENT_DB_URL` for **only** `acomtixjibgkauzeltsn`. Use the direct PostgreSQL endpoint or the session pooler on port 5432; the script rejects production, transaction-pooler port 6543, unrelated hosts, custom connection options and disabled TLS. No URL or password is printed or passed in process arguments. The default login is `postgres` for a direct connection or `postgres.acomtixjibgkauzeltsn` for the session pooler.

```sh
node apps/api/scripts/migrate-customer-development.mjs --env-file /private/path/development-database.env
node apps/api/scripts/migrate-customer-development.mjs --env-file /private/path/development-database.env --backup-dir /private/path/new-customer-migration-backup --apply
```

For a connection issued by supported Supabase CLI login, add `--cli-login-role` to either command and use `cli_login_postgres` as the direct login, or `cli_login_postgres.acomtixjibgkauzeltsn` through the session pooler. This flag explicitly sets the effective `postgres` role for every `psql` and `pg_dump` connection. Preflight checks both the effective role (`postgres`) and the expected session role (`cli_login_postgres` with the flag, otherwise `postgres`). Inherited `PG*` variables are removed before the guarded connection is constructed.

The script uses PostgreSQL binaries from `/opt/homebrew/opt/libpq/bin` by default. Use `--pg-bin /absolute/path/to/postgresql/bin` when the reviewed local installation is elsewhere; that directory must provide `psql`, `pg_dump` and `pg_restore`.

Preflight requires the `postgres` database, the migration 0023 ledger entry and the reviewed 0024 SHA-256 shown above. A partial customer schema without its ledger entry is rejected. Apply requires a new absolute backup directory outside the repository. Before any DDL, it writes a full custom-format `pg_dump`, verifies its table of contents includes Auth and application data, and records the before-state. It then applies only migration 0024 and its `public.schema_migrations` ledger entry in one transaction. RLS, browser-role denial, service-role function access, synthetic provisioning/profile/clear behavior and unchanged existing row counts are verified. Synthetic behavior checks always roll back. The receipt records migration/dump hashes and verified counts, without secrets.

If a post-commit verification fails, do not blindly rerun or remove the schema. Inspect the ledger, protected backup and reported phase. A repeat run checks the existing table RLS and browser/service-role privileges, then reports `already_applied`; it does not rerun DDL, create another backup or repeat the transactional smoke test.

## Recovery

The schema is additive, so reverting application code while retaining the tables is the first recovery choice. `supabase/customer-development-rollback.sql` is a manual empty-schema rollback and refuses to run if either new table contains customer data. Never run it after real customer use without a reviewed preservation plan. The full backup remains a separate recovery artifact, not a reason to overwrite newer data.

After verified development migration, deploy API through the existing guarded development script, then the Web build using the matching development Auth/public key. Verify signup, profile changes, saves, playlists and reload persistence against that deployment. Do not copy development data or credentials into production.

## Deployment schema check

`GET /health/customer-schema` returns only `{ "ready": true }` with HTTP 200 when migration 0024 is recorded and both customer tables expose their required columns. Missing schema, a query failure or timeout returns `{ "ready": false }` with HTTP 503. It performs no provisioning or writes and exposes no customer data.

The development release verifier requires this result before publishing Studio/Web. Working 401 account guards are insufficient: an API can reject anonymous requests while its account tables are missing. This check protects consumer deployment; it does not apply the migration or replace the backup, SQL privilege checks and hosted account verification above.

## Remaining release and email acceptance

Development Web Auth bindings have been installed and verified separately; see `docs/DEVELOPMENT_AUTOMATIC_DEPLOYMENT.md` at the repository root for their receipt and the active workflow compatibility step. The coordinated application release and hosted signup, confirmation, profile, library and attachment acceptance remain pending.

Custom Auth SMTP is still incomplete. The separate Resend domain `auth.devmail.mukhtalif.net` was created but remains unverified. The read-only Hostinger DNS inventory request returned HTTP 403 because that API identity does not own the domain. A subsequent attempt to access the private browser session for SMTP setup was rejected by automatic approval review, so setup did not proceed. No DNS records, Auth sending key or SMTP configuration were changed during these setup attempts; the earlier unverified domain creation is the only completed Auth-mail setup mutation. Do not describe customer confirmation or recovery email delivery as verified. This SMTP blocker is separate from the resolved Supabase database access issue.
