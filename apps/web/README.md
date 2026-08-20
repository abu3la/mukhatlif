# apps/web — the public Mukhtalif site

An Arabic-first, RTL Next.js App Router application. It renders the public
catalogue: the home page, programmes, episodes, and articles.

## Boundaries

- **Every read happens on the server.** Page components call the Hono API
  directly from `src/lib/api.ts`. There is no client-side data fetching, no
  Supabase client, and no API origin in the browser bundle.
- **The site renders only published content.** It calls the API anonymously, so
  the API's own permission checks decide what exists — a draft episode is not
  filtered out here, it is never returned.
- **Article bodies are the API's HTML.** `contentHtml` is produced by the Worker
  from validated editor JSON (ADR 0006). The site never renders markup that
  came from a browser, and never re-derives HTML from the editor document.

## Configuration

Copy `.env.example` to `.env.local`.

| Variable            | Purpose                                                     |
| ------------------- | ----------------------------------------------------------- |
| `MUKHTALIF_API_URL` | Origin of the Hono API. Server-side only.                    |
| `PUBLIC_WEB_URL`    | This site's canonical origin.                                |

`PUBLIC_WEB_URL` **must match the Worker's `PUBLIC_WEB_URL`**. The Worker uses
that value to build absolute article links inside a newsletter, and a sent email
cannot be rewritten: if the two disagree, already-delivered mail points at pages
this site does not serve. The value is used here for canonical tags, Open Graph
URLs, and `metadataBase`.

The API origin must also list this site in its `CORS_ALLOWED_ORIGINS` if any
browser-side call is ever added. Today none exists.

## Rendering and caching

Reads use `next: { revalidate: 60 }`, so a published change appears within a
minute without a redeploy.

When `MUKHTALIF_API_URL` is absent the data layer calls `connection()` before
failing. This opts the route into request-time rendering so a build without API
access cannot bake an error page into static output and serve it to readers.

## States

Every route renders four states deliberately:

- **Loading** — `loading.tsx` per segment, with a `role="status"` announcement.
  Skeletons stand in for content that is still streaming; no real content is
  ever hidden behind an animation.
- **Empty** — a published-nothing shelf is normal and says so.
- **Error** — an unreachable API is reported honestly rather than shown as an
  empty shelf. A detail page that loaded its subject but failed a secondary read
  still renders the subject.
- **404** — `notFound()` for an unknown slug, with a matching document title.

## Design

The palette, typeface, and wordmark are the station's own, consumed from
`@mukhtalif/design-tokens`: the indigo ink lifted from the logo, the on-air
green, and IBM Plex Sans Arabic self-hosted from `public/fonts` (never a CDN).

The one bespoke mark is the broadcast trace in `src/components/signal.tsx`. Its
bars are always painted at a resting height and only animate between heights, so
the mark stays visible when motion is reduced or unavailable.

Layout is written for RTL only and uses logical properties throughout, so there
are no left/right values to flip.

## Commands

```bash
pnpm --filter @mukhtalif/web dev
pnpm --filter @mukhtalif/web build
pnpm --filter @mukhtalif/web test
```
