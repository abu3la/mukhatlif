# Mukhtalif Learning

Frappe Learning owns course content, enrollments, progress, submissions, and certificates. The existing Hono API authenticates Supabase customers and Studio administrators. Neither browser receives a Frappe credential. Checkout is explicitly simulated; this implementation contains no Moyasar integration and collects no card details.

## Delivery status

Implemented and verified locally. No hosted learning service or live R2 connection has been provisioned. Do not describe this branch as deployed or enable courses in production until the deployment acceptance checks below pass.

Included: searchable/filterable catalogue, course details, simulated success/decline, account-bound enrollment, My Courses, video resume and watched ranges, automatic scroll-based reading completion, lesson/course quizzes, lesson/course worksheets and resources, instructor grading, and completion certificates. Studio supports course creation, publication, curriculum editing, private uploads, learner progress, and grading. Worksheets accept a text answer; learner attachment uploads are not included. Certificates can be printed or saved as PDF in the browser.

After the first enrollment, learning requirements are immutable to preserve existing progress and certificate criteria. Catalogue metadata and publication can still change. Create a new course for a revised curriculum. Quiz attempts are bounded; passing assessments and required worksheet approval are checked server-side before a certificate is issued.

## Tested upstream versions

- Frappe: `c7a96ecc99ef47adb2f6283089644fe6c26b8287`
- Frappe Learning 2.45.2: `f1ea53bcd6045fe614b246417f9f026e34f0354f`
- Frappe Payments dependency: `86fefa9faf8ad825fe6f08c4753acfe44817900b`
- Python 3.14, MariaDB, Redis, Node 22+

The Payments app is an upstream installation dependency. No real payment provider is configured or called by this bridge. Pin the tested commits rather than tracking the upstream development branches.

## Deployment boundary

Frappe requires a Python service, MariaDB, Redis, background workers, and a scheduler. It cannot run inside the existing Cloudflare Worker or Hostinger Node process. A separately provisioned compatible service is required; this change does not purchase hosting or change the current deployment topology. Development and production need separate Frappe sites, databases, bridge credentials, signing secrets, and R2 prefixes. Preserve the repository's Cloudflare-development / Hostinger-production policy and obtain the approved service-hosting arrangement before deployment.

Production web remains staging/studio/api. Do not point this feature or deployment at the apex domain.

Install Frappe, Payments, and LMS at the pinned revisions, install this package as a Bench app, then run `bench --site SITE install-app mukhtalif_learning` and migrations. The app creates only hidden bridge fields and its certificate print format. Configure a dedicated bridge user with the LMS roles required to create courses and issue certificates. Keep its API key and secret server-side.

Frappe site configuration:

- `mukhtalif_bridge_user`: dedicated service user
- `mukhtalif_media_secret`: independently generated secret of at least 32 characters
- `mukhtalif_simulation_enabled`: true only where simulated checkout is intended
- `host_name`: the HTTPS learning-service origin

Hono environment, supported by both runtime adapters:

- `LEARNING_URL`: HTTPS origin, with no path, query, or credentials
- `LEARNING_API_KEY`, `LEARNING_API_SECRET`: dedicated service credentials
- `LEARNING_SIMULATION_ENABLED=true`: explicitly enables simulated checkout

Existing Supabase authentication remains authoritative. Never enable fixture authentication on a hosted environment. Native LMS courses stay unpublished; the bridge controls publication and checks account enrollment before exposing protected content. Disabled synthetic Frappe users map to Supabase UUIDs and cannot sign in independently. No welcome or transactional email is sent by the bridge.

## Private media on R2

Set these environment variables on the Frappe service, not in browser builds or Git:

- `MUKHTALIF_LEARNING_STORAGE=r2`
- `MUKHTALIF_LEARNING_ENVIRONMENT=development` or `production`
- `MUKHTALIF_R2_ACCOUNT_ID`
- `MUKHTALIF_R2_ACCESS_KEY_ID`
- `MUKHTALIF_R2_SECRET_ACCESS_KEY`

Use the existing private `mukhtalif-media` bucket. Keys are isolated under `learning/development/` and `learning/production/`. Use separate credentials and sites. Public bucket access must remain disabled. Configure CORS for the approved web origins if the browser requires it; allow GET/HEAD and Range. Maintain a lifecycle rule for abandoned multipart uploads. Database backups must include the course asset manifests; keep matching R2 objects when restoring.

Studio uploads PDF, MP4, WebM, and MP3 files, up to 512 MiB, in 1 MiB resumable chunks. Temporary assembly is on the service's private filesystem; completed media is transferred to R2 with bounded-memory multipart upload. Temporary files expire after 24 hours through the scheduler. A failed database commit can leave an unreferenced R2 object; retain it for retry and reconcile orphaned objects operationally rather than deleting course files automatically.

Access requires an enrolled user and a published course. The bridge issues a signed capability and rechecks authorization when redeemed. R2 redirects use five-minute presigned GET URLs and no-store headers. A redeemed URL remains usable until its expiry, including after unpublishing; this is a bounded capability, not DRM. Local filesystem serving is restricted to explicitly test-enabled sites whose names start with `learning-test.`.

Text lessons persist the furthest visible reading percentage. Reaching the bottom completes the lesson; a short lesson that fits entirely is recorded after a brief visible interval. This measures content traversal, not comprehension. Video progress remains based on watched ranges.

## Verification

Commands from the repository root:

```sh
PYTHONPATH=services/learning python3 -m unittest discover -s services/learning/tests
pnpm --filter @mukhtalif/api test
pnpm --filter @mukhtalif/web test
pnpm --filter @mukhtalif/admin test
pnpm --filter @mukhtalif/web build
pnpm --filter @mukhtalif/admin build
pnpm --filter @mukhtalif/api build
```

On a disposable, explicitly test-enabled Frappe site only:

```sh
bench --site learning-test.localhost execute mukhtalif_learning.tests.integration.run
bench --site learning-test.localhost execute mukhtalif_learning.tests.integration.run_media
```

Local verification exercised real native LMS records: simulated decline/success, idempotent enrollment, protected lessons, quizzes, grading, certificate eligibility/issuance, resumable uploads, playback resume, seek exclusion, and HTTP Range responses. Browser checks used actual customer and Studio components against the real local API/Frappe service, with fixture identity only. Supabase login and live R2 delivery still need hosted acceptance testing.

`tools/learning-preview/server.mjs` is a loopback-only development harness using two fixture identities. It is not part of either production bundle. It expects the local API on port 18787 and starts on port 3102. Do not deploy this harness.

## Before enabling hosted courses

1. Provision the approved learning service with isolated environment configuration, backups, TLS, scheduler, and monitoring.
2. Connect private R2 storage and verify upload, playback seeking, expired links, and cross-account denial using real objects.
3. Configure both Hono runtime adapters and verify real Supabase login, sign-out/account switching, and resume from another browser/device.
4. Verify Studio admin access and denial for customers/editors without the required role.
5. Run both Cloudflare and Hostinger build checks required by the repository before merging or deploying.
6. Keep simulation wording visible. Replacing simulation with real billing is a separate change requiring verified provider callbacks and server-side entitlement reconciliation.
