# Elementor newsletter migration planner

This local-only tool converts the reviewed Elementor newsletter snapshot into a
deterministic, private plan for migration `0021_newsletter_subscriptions.sql`.
It cannot apply the plan. It never connects to Supabase or Mailchimp, never sends
email, and never treats legacy evidence as fresh consent or a current provider
membership state.

## Approved source

- Database: `u916712841_S5L96`
- Tables: `wp_e_submissions`, `wp_e_submissions_values`,
  `wp_e_submissions_actions_log`
- Elementor form IDs: `1678cc0a`, `79f340c2`
- WXR-backed field mapping: email=`email`, first name=`field_5f9a09d`
- Reviewed cohort: 692 submissions, deduplicated to 436 contacts
  (389 ever-success, 47 never-success)

The canonical source artifact is outside Git:

```text
/Users/abu3la/mukhtalif/backups/newsletter/2026-09-02/elementor-newsletter-source.json
```

It must remain mode `0600`. The source artifact SHA-256 is fixed in the tool as
`843dd0b8dded9742fe65081f2dfa8de143375abf910f12f3e06abc18f688f29e`;
there is no CLI override. The snapshot was produced from this SELECT-only query,
whose exact text and independently reviewed SHA-256
`91f9070730633b4b994eae2b81ba7e48bd9557a5e01c43b7a779b0915fa7dbf8`
are also fixed in the tool:

```sql
SELECT
  CAST(s.id AS CHAR) AS legacy_submission_id,
  s.element_id AS legacy_form_id,
  LOWER(TRIM(MAX(CASE WHEN v.key = 'email' THEN v.value END))) AS email,
  NULLIF(TRIM(MAX(CASE WHEN v.key = 'field_5f9a09d' THEN v.value END)), '') AS first_name,
  DATE_FORMAT(s.created_at_gmt, '%Y-%m-%dT%H:%i:%sZ') AS submitted_at,
  CASE
    WHEN MAX(CASE WHEN a.action_name = 'mailchimp' AND a.status = 'success' THEN 1 ELSE 0 END) = 1
      THEN 'ever_success'
    ELSE 'never_success'
  END AS mailchimp_evidence,
  COALESCE(
    GROUP_CONCAT(
      DISTINCT CASE
        WHEN a.action_name = 'mailchimp'
          THEN CONCAT(
            CAST(a.id AS CHAR), ':', a.status, ':',
            DATE_FORMAT(a.created_at_gmt, '%Y-%m-%dT%H:%i:%sZ')
          )
      END
      ORDER BY a.id SEPARATOR '|'
    ),
    ''
  ) AS mailchimp_action_evidence
FROM wp_e_submissions s
LEFT JOIN wp_e_submissions_values v ON v.submission_id = s.id
LEFT JOIN wp_e_submissions_actions_log a ON a.submission_id = s.id
WHERE s.element_id IN ('1678cc0a', '79f340c2')
GROUP BY s.id, s.element_id, s.created_at_gmt
ORDER BY CAST(s.id AS UNSIGNED);
```

## Dry run

Run against the fixed approved source snapshot:

```sh
pnpm import:newsletter:elementor:dry-run
```

Private artifacts are written outside Git with mode `0600`:

- `elementor-newsletter-import-plan.json`: contains email addresses, target rows,
  stable IDs, every legacy request event, source record hashes, and Mailchimp
  action-log provenance.
- `elementor-newsletter-dry-run-report.json`: contains counts and checksums only,
  with no email addresses.

The planner fails closed unless it sees exactly 692 source submissions and the
reviewed canonical split of 389/47. Re-running it with the same source produces
the same IDs, row ordering, and plan contents.

All three paths must be outside the Git repository. Their existing parent
directories must be real directories with no group or world permissions, and
the input plus any existing output file must be a real owner-only `0600` file.
The tool uses `lstat` and canonical `realpath` checks to reject leaf/parent
symlinks, paths resolving into Git, and canonical path collisions. Outputs are
written through a private `0600` temporary file and atomically renamed. The
tool never creates a missing output directory; create it explicitly with mode
`0700` before running if needed.

## Mapping contract

- One canonical subscription is produced per normalized email.
- Every one of the 692 Elementor submissions remains a separate append-only
  `legacy_request` event.
- Any historical Mailchimp success makes the canonical contact
  `legacy_unverified`; this does not claim they are currently subscribed.
- Contacts with no historical success are planned as `failed` with
  `LEGACY_MAILCHIMP_NEVER_SYNCED`.
- `consent_version` and `consent_accepted_at` remain null for all legacy events.
- No contact is queued, resubscribed, emailed, or sent to Mailchimp.

## Guarded development executor

The executor is implemented but must not be run until a fresh development
backup archive passes SHA-256 and `pg_restore --list` validation, its receipt is
reviewed, and apply receives separate explicit approval. This gate does not
claim that a scratch restore was tested. Local preflight is safe and opens no
network connection:

```sh
pnpm import:newsletter:elementor:preflight
```

Apply is locked to Supabase project `pacpdxvujkjvnaeeuute`, source SHA-256
`843dd0b8dded9742fe65081f2dfa8de143375abf910f12f3e06abc18f688f29e`,
and plan SHA-256
`4287a509b1aa263896ab2e18ce77a5210f90376cfe1c55c96cd3dfa762a101b6`.
It additionally requires this private, `0600` backup-verification receipt:

```json
{
  "schemaVersion": 1,
  "kind": "supabase_development_backup_verification",
  "projectRef": "pacpdxvujkjvnaeeuute",
  "status": "archive_verified",
  "verifiedAt": "2026-09-02T20:00:00.000Z",
  "validationMethod": "sha256_and_pg_restore_list",
  "archiveListValidated": true,
  "restoreTested": false,
  "backupArtifactPath": "/absolute/private/development-before-newsletter.dump",
  "backupArtifactSha256": "<sha256>",
  "rowCounts": {
    "newsletterSubscriptions": 0,
    "newsletterConsentEvents": 0
  }
}
```

The receipt itself is checksum-confirmed, the backup artifact is re-hashed, and
the transaction fails if either newsletter table changed after that backup.
Only after approval, supply every confirmation explicitly:

```sh
pnpm import:newsletter:elementor:apply -- \
  --backup-verification /absolute/private/backup-verification.json \
  --confirm-project pacpdxvujkjvnaeeuute \
  --confirm-source-sha256 843dd0b8dded9742fe65081f2dfa8de143375abf910f12f3e06abc18f688f29e \
  --confirm-plan-sha256 4287a509b1aa263896ab2e18ce77a5210f90376cfe1c55c96cd3dfa762a101b6 \
  --confirm-backup-verification-sha256 <reviewed-receipt-sha256> \
  --confirm-apply IMPORT_436_CONTACTS_692_EVENTS_TO_SUPABASE_DEVELOPMENT
```

The executor uses one serializable `psql` transaction with table and advisory
locks. It inserts only missing canonical contacts and legacy events. An
existing contact is resolved by normalized email, and all of its current name,
explicit-consent linkage, sync status, attempts, and provider state remain
untouched. Existing event IDs, request IDs, or legacy provenance must match
exactly or the whole transaction rolls back. A verified rerun inserts zero
rows. Before commit, the executor verifies all 436 contacts, all 692 legacy
events, and exact before/after table counts. It performs no deletes, no updates
to existing rows, no Mailchimp calls, and emits no email addresses in logs or
its private `0600` apply report.
