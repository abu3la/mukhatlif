# Mukhtalif — Product Brief (prepared, not yet built)

This fills the "[DESCRIBE THE APP HERE]" section of the build handoff. The cycle
(plan mode → visual plan artifact → phased scaffold → e2e verify → private repo)
and the settled stack decisions from the Bubbly handoff apply unchanged except
where noted below.

## What Mukhtalif is

Mukhtalif (مختلف) — live site: https://mukhtalif.net — is an existing Arabic
podcast network based in Riyadh, positioned as "الإذاعة المهنية الأولى في الوطن
العربي" (the Arab world's first professional radio), tagline "لمسار مهني يشبهك"
(a career path that suits you). It produces 16+ original shows about careers and
professional life (Petroly, Gilaf, Shaqla, Partition, Seera, Munawib, Hageeba,
Al-Mustashar, Munagasha, Bokra, Istifham, Arwiqah, Imkan, Awalim, Scenario,
Qadiyah), each with a named host. Today it distributes via YouTube / Spotify /
Apple Podcasts and the site also publishes articles.

We are building its own first-party platform: **all content is created and
managed by the Mukhtalif team** (no public creator uploads). Listeners sign up,
create accounts, subscribe, and listen.

## Surfaces (differs from the Bubbly default)

- **apps/api** — Hono on Cloudflare Workers + Supabase (per settled stack).
- **apps/web** — client web app (Next.js App Router via @opennextjs/cloudflare):
  the public site AND the signed-in listener experience (accounts,
  subscriptions, playback). This replaces the separate "landing" app — one
  Next.js app serves both public and authenticated pages.
- **apps/admin** — web admin (Vite + React SPA, React Router + TanStack Query):
  the Mukhtalif team's content studio — shows, episodes, hosts, articles,
  publishing, subscribers.
- **apps/mobile** — ONE Expo listener app (expo-router). Only one mobile role
  exists (the listener), so the one-app-per-role rule yields a single app.

## Core domain objects

1. **User** — listener account (auth via Supabase), profile, subscription state.
2. **Show** — a program: name, host(s), artwork, description, category.
3. **Episode** — belongs to a Show; audio asset, duration, show notes,
   publish lifecycle.
4. **Subscription** — a user's paid plan (prices in minor units + currency,
   snapshotted at creation, per the Bubbly rule).
5. **Article** — editorial written content (the site publishes articles today).

Supporting: Host/Person, Category, PlaybackProgress (resume position),
Follow (user ↔ show).

## The core state machine (enforced server-side, 422 on illegal)

Episode publishing lifecycle:
`draft → scheduled → published → archived`
(scheduled → draft allowed; published → archived allowed; nothing skips draft
review; archived is terminal except restore → published.)

Secondary: Subscription status `active → past_due → canceled` (+ `trialing`
if trials are wanted — confirm during plan mode).

## i18n and design notes

- **Arabic-first**: ar is the primary locale, RTL is the first-class layout;
  en is secondary. (Inverse of the Bubbly default emphasis.)
- Brand identity comes from the existing mukhtalif.net brand — professional,
  modern, inspirational-but-practical tone. Pull the real logo/colors from the
  live site during design, don't invent a new identity.
- Design per the global anti-slop law; the signature should belong to this
  brand (Arabic type as identity, audio/broadcast atmosphere), not a template.

## V1 feature scope

Deliberately deferred — the instruction is **structure first**. Assumed core:
catalog (shows/episodes), playback, search, follows, accounts, subscriptions.
Playlists/queue, comments/ratings, transcripts/clips, monetization tiers were
raised and postponed; re-ask when scoping features.

## Status

- 2026-08-08: brief prepared. Nothing scaffolded yet — the folder holds only
  ARCHITECTURE_GUIDE.md and this brief. Bubbly reference repo available at
  github.com/ahashmi95/bubbly-carwash (docs/ARCHITECTURE_GUIDE.md is the
  architecture source of truth).
- Next step when the user says go: enter plan mode, ask remaining clarifying
  questions (auth details, payment provider, audio hosting/streaming approach,
  subscription tiers), then the visual plan artifact, then phased scaffold.
