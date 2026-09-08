# Private careers attachments

Applicants can upload one CV and one portfolio as PDF files, each up to 10 MiB. `POST /forms/careers/attachments` accepts multipart `file`, `email`, `kind` (`cv` or `portfolio`), and `privacyAccepted=true`. The server bounds the request stream, validates type, size and PDF framing, rejects recognized active PDF actions, sanitizes the download name, and limits each client address to six uploads per hour. Files are downloads only; this is not a malware-scanning service or an inline PDF viewer.

The receipt contains an opaque reference and a signed token valid for one hour. The token is bound to the normalized application email and the selected attachment kind. Signing and ownership hashes use separate HMAC purpose labels derived from the existing environment-specific `FORM_RATE_LIMIT_SECRET`. The browser never receives an R2 key or a public download URL.

`POST /forms/careers` accepts up to two `attachmentTokens` at the envelope level. The API verifies the signature, owner, expiry and stored metadata, claims each upload using an R2 conditional write, creates a durable accepted copy, then saves only verified references to the existing `form_submissions.attachment_refs` field. The API assigns the submission ID before writing and checks that exact ID after a lost database response. A recovered commit completes normally. Only a definitive SQL rejection releases the claim for retry; an unresolved timeout preserves the claim and accepted file and returns `SUBMISSION_STATUS_UNKNOWN`, because the insert may still commit. Release holds an exclusive cleanup state until the failed accepted copy is deleted, so a successful concurrent retry cannot lose its file. A successfully saved application consumes its tokens and removes pending objects. No new database migration is required for attachments.

`GET /studio/form-submissions/:submissionId/attachments/:attachmentId` checks `forms.view` and the exact reference on that submission. Responses force download, use `private, no-store`, `nosniff` and a sandbox CSP. Public media endpoints cannot resolve attachment identifiers.

## Storage retention

The existing `MEDIA` R2 bucket holds environment-separated keys:

- `form-attachments/acomtixjibgkauzeltsn/pending/`: unsubmitted development uploads and temporary claim records.
- `form-attachments/acomtixjibgkauzeltsn/accepted/`: attachments belonging to saved development applications.

Automatic expiration of pending objects is not enabled. The API removes pending files after a successful submission, but applicants can close the page beforehand. Abandoned uploads remain private in storage after their one-hour tokens expire; expired tokens cannot submit or retrieve them. This does not prevent application submission or private team downloads from working.

Retention for abandoned uploads remains an operator decision. Automatic approval review rejected adding the proposed development cleanup lifecycle because that deletion policy was not explicitly authorized; no alternative deletion mechanism was applied. If a retention policy is later authorized, scope it to the exact development `pending/` prefix. Never apply pending-upload expiration to `accepted/`, the entire media bucket, another environment, or article images. Production requires its own separately approved policy and release.

Tests use in-memory R2 fixtures and disabled notification delivery. They cover byte/type/size rejection, consent, owner mismatch, token tampering/replay/expiry, two-kind limits, rate limits, definitive database-rejection retry, recovered commits, delayed commits during failed reconciliation, concurrent claim/release safety and authenticated downloads. No live application or email is sent by the tests.
