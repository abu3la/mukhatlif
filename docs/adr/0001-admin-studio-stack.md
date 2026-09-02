# ADR 0001: Admin Studio application stack and boundaries

- Status: Accepted
- Date: 2026-08-16
- Decision owner: Product owner

## Context

The earlier planning documents described the admin surface as a Next.js application backed by tRPC and Prisma. The implemented platform uses Hono on Cloudflare Workers and Supabase. The product owner subsequently confirmed that Vite is appropriate for the internal Admin Studio.

The Admin Studio is an authenticated, client-side operational tool. It does not require public indexing or server-rendered pages. The public listener website remains a separate Next.js application.

## Decision

| Concern | Decision |
|---|---|
| Admin application | Vite + React + TypeScript |
| Routing | React Router |
| Server state | TanStack Query |
| Public/listener website | Next.js |
| API | Hono on Cloudflare Workers |
| Data, authentication, storage | Supabase, accessed through Hono except for browser authentication |
| Interface direction | Arabic-first, RTL |

The browser does not access application tables directly. Supabase is used in the browser only for authentication. Business data, authorization, lifecycle validation, audit logging, and storage workflows pass through Hono.

The application follows these dependency boundaries:

```text
app composition
  -> feature pages and feature models
    -> application repository contract
      -> Hono API adapter

shared UI and formatting
  -> no feature or application imports

Hono route
  -> application service
    -> repository interface
      -> Supabase implementation
```

Demo records are permitted only through an explicitly selected fixture adapter. Production configuration must fail closed when the Hono adapter or authentication is unavailable. Demo records must never be silently mixed with remote records.

## Consequences

- The admin application is deployed as a static SPA and its host must rewrite unknown application paths to `index.html`.
- All route modules need protected-route handling and a route error boundary.
- Server records belong to TanStack Query. URL state owns list filters. Form state owns only unsaved edits.
- The API must add pagination, search, aggregate counts, guests, audit logs, and missing upload workflows before production activation of all handoff screens.
- Canonical API contracts remain in `libs/types` and `libs/validation`. Admin view models may adapt those contracts but cannot define an independent business lifecycle.

## Superseded decisions

This ADR supersedes references to a Next.js admin application, tRPC, and Prisma in earlier planning material. It does not change the Next.js decision for the public/listener website.
