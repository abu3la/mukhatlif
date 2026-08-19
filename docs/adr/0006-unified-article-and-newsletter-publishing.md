# ADR 0006: Unified Article and Newsletter Publishing

- Status: Accepted
- Date: 2026-08-17

## Context

The Studio needs one editorial workspace for a public Arabic article and its weekly email edition. Maintaining two independent bodies would create drift, while exposing Mailchimp identifiers through the public article API would leak Studio delivery metadata. Sending to a mailing list is also a consequential external action and must not be retried blindly after an uncertain response.

## Decision

The canonical body is a validated Tiptap-compatible JSON document. The API accepts only the exact editor subset used by the Studio, renders safe web HTML itself, and derives plain text for search and email. Client-supplied HTML is not accepted as canonical content.

An article has independent channels:

- `status` controls web draft and publication.
- `newsletter.status` controls Mailchimp draft synchronization and delivery.

SEO fields and newsletter settings share the article record but remain separate. `Article.version` provides optimistic concurrency. Every PATCH must include the version the editor loaded.

The route boundary is explicit:

- `/articles` returns published `PublishedArticle` projections only.
- `/studio/articles` returns canonical Studio records and requires Studio permissions.
- `/studio/articles/:id/newsletter/preview` renders a local email preview.
- `/studio/articles/:id/newsletter/campaign` creates or updates one Mailchimp draft.
- `/studio/articles/:id/newsletter/send` requires a literal confirmation, the confirmed article version and campaign ID, and a passing Mailchimp send checklist.
- `/studio/articles/:id/newsletter/reconcile` observes Mailchimp state without calling the send action again.

The public projection excludes editor JSON, newsletter state, campaign identifiers, synchronization tokens, and delivery timestamps.

Article media follows a separate, server-owned contract. `imageBlock` stores only a ready media identifier plus placement-specific alternative text, caption, and presentation. `videoEmbed` stores an allowlisted YouTube or Vimeo provider, a validated provider identifier, placement-specific title/caption, and a ready poster identifier. Source URLs and iframe HTML are never accepted from the editor. Image and video nodes are top-level only, with document limits of 30 images and 5 videos.

Images use a two-step Studio upload to retain real byte progress without exposing R2 credentials. A JSON reservation records the expected JPEG/PNG identity and dimensions; an authenticated raw PUT validates and sanitizes the exact body before it becomes publicly readable. Video binaries are not accepted in this slice. Web rendering constructs trusted provider embed URLs, while email rendering links the uploaded poster to the provider watch page and never emits an iframe or video element.

## Delivery Safety

Mailchimp credentials exist only in Hono Worker bindings. The browser receives a capability summary with sender identity and an audience name/count fetched from Mailchimp; it never receives the API key, server prefix, audience ID, or authorization header. A server-generated HMAC token binds the confirmation to the configured server, audience, sender name, reply address, and normalized public web origin without revealing their internal identifiers. Before a live send, the server re-verifies the audience and confirms that the stored campaign's Mailchimp `recipients.list_id` still matches the server configuration.

Synchronization uses a timestamped compare-and-swap lease and token. Concurrent callers cannot create two campaigns. If remote campaign creation has an ambiguous network, 5xx, or response-decoding result, the article moves to `sync_unknown` and automatic retry is blocked. This favors manual review over a duplicate campaign.

The Mailchimp draft stores the article version last synchronized. Editing the article makes the draft stale and blocks send until it is synchronized again. The send claim is fenced by both the version and campaign ID shown in the confirmation. Immediately before the checklist, the server reapplies canonical settings, HTML, and plain text so direct edits to the remote draft cannot replace Studio content. Once sent, newsletter settings and delivery metadata are immutable, while web content and SEO may continue to change.

The send path:

1. Validates the explicit confirmation and its article-version/campaign snapshot.
2. Atomically claims that exact synchronized campaign.
3. Verifies the opaque audience-confirmation token and re-reads the audience.
4. Reads the remote campaign state and verifies its audience binding.
5. Reapplies canonical campaign settings and both canonical content variants.
6. Calls Mailchimp's send checklist.
7. Calls the send action once.
8. Records `sentAt` only after Mailchimp reports `sent`.

An accepted asynchronous send remains `sending`. Reconciliation checks remote state and never invokes the send action. Each send claim has a private timestamped token that is never serialized. A concurrent request cannot release a fresh claim merely because Mailchimp still reports a draft. After 15 minutes, reconciliation may release only the exact stale lease it observed, using the timestamp and token as a compare-and-swap fence. The original worker must renew and prove ownership immediately before the send action, so a worker whose stale lease was recovered cannot send afterward. An ambiguous send response remains `sending` until Mailchimp reports delivery or the stale, still-draft lease is safely recovered.

## Persistence

Migration `0010_unified_article_publishing.sql` adds canonical content, derived HTML, SEO, newsletter state, versioning, campaign synchronization, and lease columns. Existing plain article bodies are escaped and backfilled into a paragraph document. Migration `0011_article_media_assets.sql` adds private upload metadata and pending/uploading/ready state for sanitized R2 images.

The migration is additive but must be applied and verified in a staging Supabase project before production. It has not been executed by local application checks.

## Consequences

- Web and email editions cannot silently diverge.
- Public consumers receive a deliberately limited contract.
- Live email delivery fails closed when configuration, audience verification, checklist readiness, synchronization, or concurrency checks fail.
- An ambiguous initial Mailchimp create requires operational review before retry.
- Email rendering remains deliberately conservative and table-based for client compatibility.
