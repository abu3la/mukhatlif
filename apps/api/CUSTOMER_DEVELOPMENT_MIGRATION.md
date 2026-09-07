# Customer accounts: development database release

Migration `0024_customer_accounts_library.sql` adds private customer profile and library tables plus three service-role-only functions. It does not change Studio roles, memberships, publication data or existing customer records. New account provisioning is an explicit authenticated API call and independently checks the confirmed Supabase Auth identity.

As of September 8, the migration has **not been applied to development**. The available Supabase CLI identity lists production and an unrelated project; its read-only query for development `acomtixjibgkauzeltsn` returns HTTP 403. The development service-role key can use existing tables but cannot apply schema changes. Production `pacpdxvujkjvnaeeuute` remains outside this task.

The migration and transaction/rollback behavior execute in the API test suite using an isolated PGlite PostgreSQL database containing the relevant current identity tables. `scripts/customer-postgres.test.mjs` runs the actual migration, release smoke transaction, browser-role denial and service-role identity checks. Run it with `pnpm --filter @mukhtalif/api test`; this validates SQL behavior, not hosted deployment. API identity, profile, library isolation and concurrent-write tests also pass.

## Reviewed apply procedure

Create a protected environment file outside Git containing `MUKHTALIF_DEVELOPMENT_DB_URL` for **only** `acomtixjibgkauzeltsn`. Use the direct PostgreSQL endpoint or the session pooler on port 5432; the script rejects production, transaction-pooler port 6543, unrelated hosts and disabled TLS. No URL or password is printed or passed in process arguments.

```sh
node apps/api/scripts/migrate-customer-development.mjs --env-file /private/path/development-database.env
node apps/api/scripts/migrate-customer-development.mjs --env-file /private/path/development-database.env --backup-dir /private/path/new-customer-migration-backup --apply
```

Preflight requires the migration 0023 ledger entry and the reviewed migration SHA-256. Apply requires a new backup directory outside the repository. Before any DDL, it writes a full custom-format `pg_dump`, verifies its table of contents includes Auth and application data, and records the before-state. It then applies only migration 0024 and its `public.schema_migrations` ledger entry in one transaction. RLS, browser-role denial, service-role function access, synthetic provisioning/profile/clear behavior and unchanged existing row counts are verified. Synthetic behavior checks always roll back. The receipt records migration/dump hashes and verified counts, without secrets.

If a post-commit verification fails, do not blindly rerun or remove the schema. Inspect the ledger, protected backup and reported phase. A repeat run verifies an already-applied migration rather than applying it twice.

## Recovery

The schema is additive, so reverting application code while retaining the tables is the first recovery choice. `supabase/customer-development-rollback.sql` is a manual empty-schema rollback and refuses to run if either new table contains customer data. Never run it after real customer use without a reviewed preservation plan. The full backup remains a separate recovery artifact, not a reason to overwrite newer data.

After verified development migration, deploy API through the existing guarded development script, then the Web build using the matching development Auth/public key. Verify signup, profile changes, saves, playlists and reload persistence against that deployment. Do not copy development data or credentials into production.
