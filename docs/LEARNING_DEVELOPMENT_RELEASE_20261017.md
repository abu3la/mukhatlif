# Native learning development release

Released October 17, 2026 to Cloudflare development only. Application source is
`1e353b8`; subsequent release bookkeeping and migration-runner changes do not alter
the deployed application bundles. Payment is simulation only. Frappe is not used.

## Connectivity and database

Supabase project `acomtixjibgkauzeltsn` was INACTIVE and returned NXDOMAIN on October 16. Its supported Management API restore completed with ACTIVE_HEALTHY. The existing
customer-schema health endpoint returned ready:true afterwards.

After the owner approved renewal of the temporary CLI database login, migration
0025 was applied using the Session Pooler on port 5432. Direct IPv6 connections timed
out. The migration runner now sets the supported postgres role explicitly because
Session Pooler does not reliably forward PGOPTIONS. pg_dump uses --role=postgres.
No authentication checks or TLS verification were disabled.

Private full database/Auth backup and receipt:
`/Users/abu3la/mukhtalif/backups/learning-development-20261017/`.
The archive TOC was checked; existing Auth, users, articles and episodes fingerprints
were unchanged. All four learning tables have RLS and deny browser-role access.
Migration SHA256: `9ca66a9d56c136128998689483f56d59d6e11e46c6f91d191868b8bf14c3183c`.
Dump SHA256: `14fad2efe48a282c001d779c71fb11b5e7743bad8b0c69afef0287c4aac87e8e`.

## Deployment receipts

| Worker        | Version                              |
| ------------- | ------------------------------------ |
| mukhtalif-api | 92aeb5b9-82a7-41f8-86e5-9e7d5cd0c010 |
| studio        | f7f4b5f3-de96-4da1-81bc-8161d54ac27e |
| web           | c01b41a2-e498-40ec-8068-7dca432c16a6 |

The guarded API and Studio scripts were used. Studio pinned the development API and
matching anon key. Web used the OpenNext deployment script and removed dotenv
fallbacks. ALLOW_DEV_AUTH remains false; private MEDIA and AUDIO bindings are retained.

## Acceptance

The owner authorized two disposable customer accounts and a test session for an
existing administrator, without changing Studio permissions or sending emails.
Real Auth verification and deployed HTTP routes passed:

- Rich-document save/render with private lesson bodies and answer keys omitted from public responses.
- Enrollment denial before checkout, declined simulation, successful simulation and idempotent order reuse.
- Reading completion, quiz gating and grading, required worksheet submission and administrator approval.
- Certificate denial before requirements and issuance after completion.
- Isolation between customer accounts and library listing.
- Fresh real Auth login restoring the completed course and certificate.
- Native R2 multipart MP4 upload, exact byte-range comparison, suffix ranges, 416 invalid-range response and private no-store caching.
- Unknown-file denial and publication revocation blocking an existing media ticket.
- Browser playback on deployed Web: readyState 4, advancing time, paused false, no media error.
- Anonymous registration button redirecting to login with the course return path.

The 16 focused learning tests passed again. The prior full validation was 1336 tests.
Studio and Web production-target Cloudflare builds passed. No real payment transaction
was made. No production database, Hostinger service, DNS or apex site was changed.

## Test cleanup

The two test courses, their enrollments and media tickets, the R2 test object, and
both disposable customer/Auth accounts were removed after verification. Test
sessions were revoked. The development catalogue is empty until real courses are
created through Studio. No local smoke courses were promoted as real content.
