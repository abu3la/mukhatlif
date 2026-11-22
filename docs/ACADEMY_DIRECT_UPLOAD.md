# Academy direct uploads to R2 (2026-11-22)

Course files (lesson videos, trailers, MP3, PDF) now go from the browser
straight to the private R2 bucket `mukhtalif-media`. The API no longer carries
the bytes when it can sign R2 links.

## Why

Measured on production on 2026-11-22 (commit `f06473f`):

- Every 5 MiB piece went browser → Hostinger CDN → Hostinger Node → R2, one at
  a time, as base64 JSON (about 7 MB on the wire).
- The Hostinger CDN (`hcdn`) gives each HTTP/2 upload a 64 KiB window, so a
  request on HTTP/2 tops out near 0.4 to 0.6 MB/s even on a fast line (the same
  Mac uploads 12.9 MB/s to Cloudflare).
- The CDN ends any request at about 60 seconds with a `307` that carries no CORS
  headers. The browser reports it as «Failed to fetch», and the old client had no
  retry, so one slow piece lost the whole upload.
- The server spent about 1.3 s on each piece before the next could start. A
  1254.2 MB file took 8 min 52 s from a fast connection and much longer, or
  failed, on slower ones.

## How it works now

1. `POST /studio/courses/:id/upload-start` creates the R2 multipart upload and
   the `learning_assets` row, then answers `{ token, chunkSize, direct: true }`
   when this runtime can sign links. Parts stay 5 MiB.
2. `POST /studio/courses/:id/upload-sign` `{ token, parts: [n, …] }` (up to 64)
   returns one signed `PUT` link per part, valid for at most one hour and never
   past the upload's 24-hour lifetime. Only the admin who started the upload can
   sign its parts.
3. The browser `PUT`s raw bytes to the links, four parts at a time, with byte
   progress. A failed part is retried on its own after 1, 2, 4, 8, 15 and 30
   seconds; a refused link (400/403) is signed again. Parts that arrived are kept,
   so «استئناف الرفع» continues from where it stopped while the page stays open.
4. `POST /studio/courses/:id/upload-finish` `{ token, parts: [{ part, etag }] }`
   completes the upload in R2 (R2 rejects any wrong ETag), checks the stored
   size and the file's first bytes against its type, deletes the object if
   either is wrong, and only then marks the asset ready.

Without signing keys (local `wrangler dev`, or the development Worker before its
secrets exist), `upload-start` omits `direct` and the Studio uses the previous
route through the API, unchanged.

Code: `apps/api/src/storage/r2-upload-signer.ts`, `apps/api/src/learning/uploads.ts`,
`apps/api/src/routes/courses.ts`, `apps/admin/src/features/courses/course-upload.ts`.

## Required setup

### 1. CORS rule on the R2 bucket `mukhtalif-media` (before production)

The browser can only `PUT` to R2 and read each part's `ETag` if the bucket allows
it. In the Mukhtalif Cloudflare account: R2 → `mukhtalif-media` → Settings →
CORS policy. If a policy already exists, add this rule to it instead of
replacing it.

```json
[
  {
    "AllowedOrigins": [
      "https://studio.mukhtalif.net",
      "https://studio.mukhtalif-development.workers.dev"
    ],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

This does not make the bucket public: every `PUT` still needs a signed link
that names one key, one upload and one part, and expires.

**Release order:** apply this rule before the change reaches `main`. Hostinger
signs links as soon as it runs this code, so without the rule production course
uploads stop at the first part with «تعذّر تأكيد رفع جزء من الملف».

### 2. Development Worker signing keys (to test on development)

`apps/api/wrangler.jsonc` already sets `R2_ACCOUNT_ID` and `R2_MEDIA_BUCKET`.
Create a development R2 API token with **Object Read & Write** limited to
`mukhtalif-media`, then from `apps/api`, signed in to the Mukhtalif account:

```bash
npx wrangler secret put R2_ACCESS_KEY_ID
npx wrangler secret put R2_SECRET_ACCESS_KEY
```

Never reuse the Hostinger production keys here.

### 3. Production

Nothing new to configure. Hostinger already has `R2_ACCOUNT_ID`,
`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and `R2_MEDIA_BUCKET`; the same key
signs the links (`apps/api/src/runtime/hostinger-env.ts`).

## Verification so far

- API: 729 tests pass, including `uploads.test.ts` (signing limits, owner
  check, lifetime cap, ordered finish, forged ETag, wrong size, wrong file type,
  the API route still working) and `r2-upload-signer.test.ts`.
- Studio: 481 tests pass, including `course-upload.test.ts` (four parts at a
  time, retry and backoff, re-signing, final refusals, resume, finish retry) and
  editor tests for the direct route and resume.
- Local browser run against a mock API and a mock R2 with the CORS rule above:
  a 24 MB upload with dropped parts retried itself and finished; a 40 MB upload
  cut off mid-way stopped after about a minute with «استئناف الرفع» and resumed
  from part 37 without starting over; the same at 390 px wide.
- Not yet run against real R2: that needs the CORS rule and the development
  secrets, then a real upload on the development Studio.
