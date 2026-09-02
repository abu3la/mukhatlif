# Public forms and Studio inbox

The API stores every valid request before it attempts email delivery. A provider
failure never discards the request and never changes the public success response.

## Public endpoint

`POST /forms/:type`

Supported types:

- `sponsorship`
- `partnership`
- `guest_suggestion`
- `careers`
- `production_service`
- `guest_review`

Every body has this envelope:

```json
{
  "payload": {},
  "privacyAccepted": true,
  "companyWebsite": ""
}
```

`companyWebsite` is a hidden honeypot. The UI must leave it empty. The successful
response is intentionally opaque for both real and honeypot submissions:

```json
{ "accepted": true }
```

The success status is `202`. Invalid input returns `400`, an oversized body
returns `413`, and rate limiting returns `429` with `Retry-After`.

The rate limiter fingerprints the form type and Cloudflare client address with
HMAC-SHA256. Set `FORM_RATE_LIMIT_SECRET` to an independent random secret of at
least 32 bytes. It is mandatory whenever Supabase is configured and in every
deployed environment. Only the explicitly gated in-memory development server
has a local fallback. The database RPC removes at most 250 inactive rate rows
per claim once they are older than 48 hours.

Payload fields:

| Type                 | Required                                                          | Optional                                          |
| -------------------- | ----------------------------------------------------------------- | ------------------------------------------------- |
| `sponsorship`        | `organizationName`, `contactName`, `email`, `phone`               | `message`                                         |
| `partnership`        | `organizationName`, `contactName`, `email`, `phone`, `proposal`   | `partnershipType`, `organizationWebsite`          |
| `guest_suggestion`   | `guestName`, `profession`                                         | `showName`, `socialUrl`, `city`, `phone`, `notes` |
| `careers`            | `name`, `email`, `phone`, `desiredRole`, `whyMukhtalif`, `skills` | `socialUrl`, `portfolioUrl`                       |
| `production_service` | `name`, `email`, `phone`, `details`                               | `organizationName`                                |
| `guest_review`       | `guestName`, `showName`, `overallRating`, `hostRating`            | `email`, `notes`                                  |

Career file uploads are not enabled yet. Stored rows already include
`attachmentRefs: []`, so an authenticated private upload flow can be added later
without changing the submission contract.

## Studio endpoints

All reads require `forms.view`; changes and notification retries require
`forms.manage`.

- `GET /studio/form-submissions`
- `GET /studio/form-submissions/:id`
- `PATCH /studio/form-submissions/:id`
- `POST /studio/form-submissions/:id/notification/retry`

List filters are `type`, `status`, `assigneeId`, `page`, and `perPage`. The update
body accepts `status`, `assigneeId` as a member ID or `null`, and `internalNotes`.
Without `page`/`perPage`, the list response is a record array. Supplying either
returns the standard `{ items, pageInfo }` envelope.

Every detail, update, and list item uses this record shape:

```ts
interface FormSubmission {
  id: string;
  type: FormSubmissionType;
  payload: FormSubmissionPayload;
  status: FormSubmissionStatus;
  assigneeId?: string;
  internalNotes: string;
  attachmentRefs: FormSubmissionAttachmentRef[];
  sourceMetadata: FormSubmissionSourceMetadata;
  notificationStatus: 'pending' | 'sending' | 'sent' | 'failed' | 'unconfigured';
  notificationAttemptCount: number;
  notificationAttemptedAt?: string;
  notificationError?: string;
  notificationProviderMessageId?: string;
  statusUpdatedAt: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}
```

Statuses are `new`, `in_review`, `contacted`, `resolved`, `rejected`, and `spam`.

## Email notifications

Form email is locked to one of two complete environment policies. Configure the
profile, sender, and all six routes before enabling the environment's API key.
Development runs on Cloudflare and sends every form to the owner's test inbox;
production runs on Hostinger and sends to the responsible teams.

```dotenv
DEPLOYMENT_PLATFORM="cloudflare-workers"
RESEND_ENVIRONMENT="development"
RESEND_API_KEY="..."
FORMS_FROM_EMAIL="forms@devmail.mukhtalif.net"
FORM_NOTIFICATION_RECIPIENTS_JSON='{"sponsorship":["aaahashmi95@gmail.com"],"partnership":["aaahashmi95@gmail.com"],"guest_suggestion":["aaahashmi95@gmail.com"],"careers":["aaahashmi95@gmail.com"],"production_service":["aaahashmi95@gmail.com"],"guest_review":["aaahashmi95@gmail.com"]}'
```

The application rejects missing form types, changed recipients, a sender from
the other environment, or a Resend profile on the wrong platform before it
contacts Resend. A complete non-secret policy without `RESEND_API_KEY` leaves
the saved request with `notificationStatus` set to `unconfigured`. Provider
failure sets it to `failed`. Studio can retry either state. Delivery leases
prevent concurrent retries, and the Resend request uses the submission ID as
its idempotency key so a lost provider response is not immediately duplicated
by a retry.

Only a short, predefined error code is persisted. Provider bodies, API keys,
raw client addresses, and other secrets are never stored in a submission.

## Rollout

1. Apply `0017_form_permissions.sql`, then `0018_form_submissions.sql`. They are
   separate because PostgreSQL must commit new enum values before a later
   transaction can use them.
2. Run `apps/api/supabase/verify_deployment.sql` and require every check to read
   `ok` before exposing the public forms.
3. Configure `FORM_RATE_LIMIT_SECRET` as a Worker secret. Never reuse or log the
   Supabase service-role key for this purpose.
4. Follow `RESEND_ENVIRONMENTS.md`. Put only the development key on the
   Cloudflare Worker; put only the production key in Hostinger's environment
   panel. The two environments use separate verified domains and restricted
   keys.
5. Run the platform guard, then test with the development Resend environment
   before routing real production traffic.
