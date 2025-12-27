# ADR-0001: Monorepo Structure with pnpm Workspaces

## Status

Accepted

## Context

We need to organize the codebase for an AI-first accounting assistant application. The application consists of multiple components: a web frontend, an API server, background workers, and shared packages for core types, domain logic, AI adapters, and database access.

## Decision

Use a monorepo structure with pnpm workspaces and Turborepo for build orchestration.

### Structure

```
/
├── apps/
│   ├── api/         # Hono API server
│   ├── worker/      # BullMQ background job processor
│   └── web/         # Next.js frontend
├── packages/
│   ├── core-ledger/ # Zero-dependency core types
│   ├── domain/      # Business logic and Zod schemas
│   ├── ai/          # AI adapters (extraction, categorization, chat)
│   └── db/          # Drizzle ORM schemas and client
└── docs/
    └── adr/         # Architecture Decision Records
```

### Dependency Rules

- `apps/*` can import from `packages/*`
- `packages/core-ledger` has zero external dependencies
- `packages/domain` can import `core-ledger` but not UI
- `packages/ai` can import schemas and domain types, not DB directly
- `packages/db` is used by `apps/api` and `apps/worker` only

## Consequences

Pros:

- Shared types ensure consistency across the stack
- Turborepo enables efficient caching and parallel builds
- Clear dependency boundaries prevent circular dependencies
- Independent versioning and testing per package

Cons:

- Initial setup complexity
- Requires discipline to maintain dependency rules
- IDE support for workspace-linked packages can be inconsistent

## Alternatives

- Separate repositories with npm packages (rejected: too much overhead for small team)
- Single-package monolith (rejected: harder to maintain boundaries)
