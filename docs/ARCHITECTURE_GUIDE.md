# A Practical Guide to Building a React Monorepo

As a React product grows, splitting it across multiple repositories can become expensive. Components, types, and tool configurations get duplicated; package versions drift; and a single change may require coordinated pull requests across several repositories.

A monorepo addresses these problems by keeping related applications and shared libraries in one repository while preserving clear boundaries between them.

This guide presents a generic starting point for React projects containing web applications, React Native applications, and shared packages.

## What Is a Monorepo?

A monorepo is one repository containing multiple packages that remain relatively independent:

- **Applications** are runnable and deployable products.
- **Libraries** contain reusable code consumed by applications or other libraries.
- **Root tooling** coordinates installation, builds, tests, and static checks across the workspace.

```text
Repository
├── applications
├── shared libraries
└── workspace tooling
```

A monorepo does not mean combining everything into one large application. The goal is to share a repository and its tooling while keeping each package focused on a specific responsibility.

## A Suggested Structure

```text
react-monorepo/
├── apps/
│   ├── marketing-site/          # Public website, such as a Next.js app
│   ├── customer-app/            # Authenticated web application
│   └── mobile-app/              # Expo + React Native, if needed
├── libs/
│   ├── design-tokens/           # Colors, typography, spacing, and motion
│   ├── ui-web/                  # Web UI components
│   ├── ui-native/               # React Native UI components
│   ├── api-client/              # HTTP client, services, and data hooks
│   ├── types/                   # Shared TypeScript types
│   ├── i18n/                    # Translations and locale helpers
│   ├── validation/              # Runtime validation schemas
│   └── utils/                   # Pure shared utilities
├── docs/
├── scripts/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
└── eslint.config.mjs
```

These names are conventions, not requirements. Some teams use `packages/` instead of `libs/`. What matters is maintaining a visible distinction between deployable applications and reusable libraries.

## The Responsibility of `apps/`

Each directory under `apps/` represents a product or surface that can be run and deployed independently.

An application usually contains:

- Routes, layouts, and screens.
- User-flow orchestration.
- Platform-specific configuration.
- Integration of shared libraries.
- Business behavior unique to that application.

For example, a web application might look like this:

```text
apps/customer-app/
├── package.json
├── tsconfig.json
└── src/
    ├── app/                     # Routes and layouts
    ├── features/                # Product features
    ├── components/              # Application-specific components
    ├── hooks/                   # Application-specific hooks
    ├── stores/                  # Local client state
    └── lib/                     # Application-specific utilities
```

An application should never import code directly from another application. If two applications genuinely need the same code, move it into a library with a clear responsibility.

## The Responsibility of `libs/`

Each directory under `libs/` represents a reusable capability with a deliberate public API.

Consumers import that capability by package name:

```tsx
import { Button } from '@acme/ui-web';
import { useOrders } from '@acme/api-client';
import type { Order } from '@acme/types';
```

### Common Libraries

| Library | Responsibility |
|---|---|
| `design-tokens` | Shared visual values such as colors, typography, spacing, radii, and motion |
| `ui-web` | Reusable presentation components for web applications |
| `ui-native` | Reusable presentation components for React Native applications |
| `api-client` | Server communication, services, data hooks, authentication, and error policies |
| `types` | Shared TypeScript types and domain contracts |
| `i18n` | Translation catalogs, locale formatting, and language helpers |
| `validation` | Runtime validation schemas, commonly implemented with Zod |
| `utils` | Pure, platform-neutral helper functions |

Not every project needs all these libraries. Start with responsibilities that have real consumers, and introduce a new library only when a clear shared boundary emerges.

## How the Package Manager Connects the Workspace

With pnpm, workspace members can be declared using directory patterns:

```yaml
# pnpm-workspace.yaml
packages:
  - "apps/*"
  - "libs/*"
```

An application can then depend on a local library using the `workspace:*` protocol:

```json
{
  "name": "customer-app",
  "private": true,
  "dependencies": {
    "@acme/api-client": "workspace:*",
    "@acme/types": "workspace:*",
    "@acme/ui-web": "workspace:*"
  }
}
```

When `pnpm install` runs, pnpm links these local packages together. The team can test changes across a library and its consumers without publishing an intermediate package to npm.

## The Role of Turborepo

The package manager understands packages and dependencies. Turborepo coordinates tasks across them.

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "type-check": {
      "dependsOn": ["^build"]
    },
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

The `^build` syntax means “build this package's dependencies first.” If an application depends on a UI library, Turborepo builds the library before the application. It can also reuse cached output for tasks whose inputs have not changed.

## Dependency Direction

Keeping everything in one repository does not mean allowing every possible import. A simple dependency direction might look like this:

```text
apps
├──→ api-client ──→ types + validation
├──→ ui-web ──────→ design-tokens
├──→ ui-native ───→ design-tokens
├──→ i18n
├──→ validation ──→ types
└──→ utils
```

Useful rules include:

1. Applications depend on libraries, never the reverse.
2. One application does not depend on another application.
3. Foundation libraries such as `types` and `design-tokens` do not depend on higher layers.
4. UI libraries contain presentation code, not business logic or HTTP requests.
5. Platform-neutral libraries do not access the DOM, `window`, or native APIs directly.

Tools such as `eslint-plugin-boundaries` and `no-restricted-imports` can enforce these rules automatically.

## Server Data Flow

Server communication should usually be centralized in one library:

```text
Screen
  → typed query or mutation hook
  → API service
  → HTTP client
  → backend
```

An application consumes a typed hook:

```tsx
import { useOrders } from '@acme/api-client';

export function OrdersScreen() {
  const orders = useOrders();

  if (orders.isPending) return <OrdersSkeleton />;
  if (orders.isError) return <ErrorState />;

  return <OrdersList orders={orders.data} />;
}
```

The HTTP implementation stays inside `api-client`:

```ts
export const ordersService = {
  list: async () => {
    const response = await httpClient.get('/orders');
    return response.data;
  },
};
```

This design centralizes authentication, errors, retries, caching, and request behavior. It also prevents each application from developing a different approach to the same backend.

## Server State Versus Client State

A common mistake is placing every kind of state in one global store.

### Server State

Server state includes data returned by an API, along with loading, error, caching, and synchronization behavior. A library such as TanStack Query is designed for this responsibility.

### Client State

Client state includes an open dialog, the current wizard step, a temporary selection, or a draft that has not been submitted. React state or a small store such as Zustand can manage it when appropriate.

Do not copy API data into Zustand simply because multiple screens use it. Let the query cache remain the source of truth for server state.

## Separating Web and Native UI

React DOM and React Native can share visual values, types, validation, and API behavior. They usually should not share the same component implementations.

```text
design-tokens ──→ ui-web
              └─→ ui-native
```

- `ui-web` uses DOM elements and CSS.
- `ui-native` uses primitives such as `View` and `Text`.
- Both consume shared tokens to preserve the same visual identity.

This boundary lets each platform follow its native conventions without forcing a leaky abstraction across two different rendering systems.

## Where Should Code Live?

Keep code inside an application when:

- It has one consumer.
- It belongs to a specific route or screen.
- It depends on a particular framework or platform.
- It represents product behavior unique to one application.

Move code into a library when:

- It has more than one real consumer.
- It represents a central contract, such as a type or validation schema.
- It must behave consistently across applications.
- It has a public API that can be described and tested independently.

A useful rule of thumb is:

> Start locally inside the application, then extract the code when sharing becomes real. Do not build an abstraction for a hypothetical future consumer.

## Designing a Library's Public API

Each library should have a clear entry point:

```text
libs/types/
├── package.json
├── tsconfig.json
└── src/
    ├── order.ts
    ├── customer.ts
    └── index.ts
```

The entry point exposes only the supported API:

```ts
// src/index.ts
export type { Order } from './order';
export type { Customer } from './customer';
```

The package manifest declares what consumers can import:

```json
{
  "name": "@acme/types",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  }
}
```

Avoid exporting every internal file. A small and intentional public API allows the library's implementation to change without breaking consumers.

## Shared TypeScript Configuration

Common TypeScript rules can live in a root configuration:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  }
}
```

Each application or library extends that configuration:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

Individual packages can add platform-specific options without duplicating the common baseline.

## Root Commands

The root `package.json` gives developers and CI one consistent interface:

```json
{
  "name": "react-monorepo",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "type-check": "turbo type-check",
    "test": "turbo test",
    "format": "prettier --write ."
  }
}
```

Common commands include:

```bash
pnpm install
pnpm dev
pnpm build
pnpm lint
pnpm type-check
pnpm test
```

You can also target one package:

```bash
pnpm --filter customer-app dev
pnpm --filter @acme/api-client test
```

## Adding a New Application

1. Create `apps/<app-name>/`.
2. Add a `package.json` with a unique name and `private: true`.
3. Add a `tsconfig.json` extending the shared configuration.
4. Define the appropriate `dev`, `build`, `lint`, `type-check`, and `test` tasks.
5. Declare local libraries using `workspace:*`.
6. Update boundary rules if ESLint explicitly classifies application types.
7. Run the workspace checks from the repository root.

## Adding a Shared Library

1. Confirm that the responsibility does not belong in an existing library.
2. Verify that there is real reuse or a clearly central contract.
3. Create `libs/<library-name>/`.
4. Add a `package.json` with a scoped name such as `@acme/<library-name>`.
5. Add `src/index.ts` as the public entry point.
6. Declare internal dependencies using `workspace:*`.
7. Add appropriate boundary rules and tests.
8. Run type checking, linting, and tests from the workspace root.

## Common Mistakes

### Turning `libs/` Into a General Dumping Ground

Every library should have a specific responsibility. Avoid one large `shared` package that mixes UI, API behavior, types, validation, and miscellaneous utilities.

### Creating a Library for Every File

Too many packages increase configuration and cognitive overhead. Introduce a package when its boundary, ownership, or reuse justifies the cost.

### Allowing Imports Between Applications

This couples release cycles and makes applications less independent. Move the shared contract or behavior into a library.

### Sharing Web Components Directly With React Native

Share tokens, contracts, and platform-neutral behavior. Keep each platform's component implementation separate.

### Relying on Dependency Hoisting

Every package must declare its own dependencies in `package.json`. An import that works only because a dependency happens to exist at the repository root is an undeclared and fragile dependency.

### Extracting Code Too Early

Start in the smallest correct location. Promote code to a library when a second consumer or a genuinely shared contract appears.

## Review Checklist

- Can every application run and deploy independently?
- Does every library have one clear responsibility and a deliberate public API?
- Do dependencies point from applications toward libraries?
- Is server communication centralized in an API client?
- Are server state and client state managed separately?
- Does every package declare its own dependencies?
- Can build, lint, type checking, and tests run from the root?
- Are architecture boundaries enforced by tooling rather than documentation alone?
- Has the project avoided abstractions without real consumers?

## Conclusion

A successful monorepo is more than an `apps/` directory and a `libs/` directory. It depends on three fundamentals:

1. A clear separation between deployable products and shared capabilities.
2. A deliberate dependency direction enforced by tooling.
3. A consistent command surface for development, testing, and CI.

Start with a small structure, share code only when the need becomes real, and make architectural boundaries machine-checkable. Done well, a monorepo provides the speed of coordinated change without turning the repository into a tightly coupled system that is difficult to maintain.
