# Notion guest-library dry run

This tool reconciles the privacy-allowlisted Notion guest snapshot with episodes
that already exist as `published` in the canonical development Supabase project
`pacpdxvujkjvnaeeuute`. Dry-run is the default. Nothing targets production.

The parser accepts schema version 2 only, rejects unknown fields and duplicate
canonical Notion page IDs, and requires the snapshot-level episode filter to be
`نشرت`. Email, phone, contact IDs, internal AI fields, and raw episode relations
are absent from the allowlist.

Run:

```sh
pnpm import:guests:notion:dry-run
```

An episode is eligible only when all of these checks pass:

1. `رابط الحلقة` in Notion must be an explicit `youtube.com` or `youtu.be`
   video URL. This is a hard gate, even when other metadata matches;
2. YouTube's official oEmbed endpoint returns HTTP 200 for that video;
3. channels owned by Mukhtalif are allowlisted by exact `author_name`. An
   external author is eligible only through strong YouTube-title evidence and
   never through the guest-name fallback;
4. the Notion product relation maps to one existing show;
5. the target already exists with `status=published` in the development
   site's `episodes` table;
6. the match is unique and supported by an exact YouTube video ID, strong
   normalized oEmbed-title evidence inside that show, or every full guest-name
   token in the target title/notes. Date may narrow already-strong evidence but
   is never accepted by itself.

Ambiguous, weak, absent, future, audio-only, unapproved-channel, and target
collision cases remain review issues. Guest photos remain source references and
are not imported as expiring URLs. Known Notion error placeholders in role,
city, and bio are cleared and counted. Duplicate normalized names retain their
separate Notion-derived identities.

The oEmbed cache, full plan, and compact report use mode `0600`. Every supplied
social token is reported. Only a safe HTTPS URL is eligible; multiple distinct
URLs on one platform defer that platform without blocking the guest or their
appearance.

## Guarded development apply

Apply exists for a separately reviewed plan but must not be run before approval:

```sh
pnpm import:guests:notion:apply -- \
  --confirm-project pacpdxvujkjvnaeeuute \
  --confirm-plan-sha256 <reviewed-plan-sha256>
```

It locks to the exact development REST and pooler targets, verifies all reviewed
hashes and the current published catalogue, rejects unexpected IDs/slugs or
stale rows, and calculates an idempotent delta. Any later-approved writes use a
single `psql` transaction containing inserts only. A failure rolls everything
back, a verified rerun writes zero rows, and the apply report is mode `0600`.
