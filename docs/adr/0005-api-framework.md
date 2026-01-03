# ADR-0005: Next.js API Routes for Backend

## Status

Accepted (Updated - supersedes previous Hono decision)

## Context

We need an API framework that integrates well with our Next.js frontend, supports TypeScript, and works seamlessly with serverless deployment.

## Decision

Use **Next.js App Router API Routes** as the API framework.

### Key Features

- Unified codebase (frontend + API in same repo)
- Built-in TypeScript support
- Serverless-ready with Vercel deployment
- Server Components for data fetching
- Server Actions for mutations

### Route Structure

```
apps/web/src/app/api/
├── documents/        # Document upload, status, approval
├── invoices/         # Invoice CRUD, status transitions
├── transactions/     # Transaction listing, categorization
├── reports/          # Cashflow, VAT, dashboard
├── chat/             # Financial Q&A
├── workspaces/       # Workspace management
├── categories/       # Category CRUD
├── rules/            # Categorization rules
├── matches/          # Invoice-transaction matching
└── gl/               # General ledger (journal entries, accounts)
```

### Validation

All request bodies validated with Zod schemas from `@moneio/domain`.

### Service Layer

Business logic extracted to `@moneio/app-services` package:

- Thin API routes (< 50 lines each)
- Reusable service layer for RSC and API routes
- Repository pattern with Prisma implementations

## Consequences

### Pros

- Single deployment (frontend + API together)
- Shared types between frontend and backend
- Automatic code splitting and tree shaking
- React Server Components for optimal data fetching
- Streaming responses with Suspense

### Cons

- Coupled to Next.js/Vercel ecosystem
- 10-60s function timeout limits
- Less control over HTTP layer than dedicated API framework

### Mitigations

- Heavy processing offloaded to BullMQ workers
- Core business logic stays in `@moneio/domain` (portable)
- Service layer in `@moneio/app-services` is Next.js-agnostic

## Historical Note

This ADR supersedes the original Hono decision. The Hono API server (`apps/api/`) was never fully implemented. Next.js API routes proved sufficient and simpler for our needs.

## Related Decisions

- ADR-0006: Serverless-First Architecture
- ADR-0004: Document Ingestion Pipeline (BullMQ workers for heavy processing)
