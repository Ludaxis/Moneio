# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Moneio is an AI-powered accounting assistant for small businesses. It handles document extraction (invoices, receipts, bank statements), smart categorization, invoice-to-transaction matching, and financial Q&A.

## Common Commands

```bash
# Install dependencies
pnpm install

# Development
pnpm dev              # Start all services (web + worker)
pnpm dev:web          # Start only the web app
pnpm dev:worker       # Start only the background worker

# Quality checks
pnpm typecheck        # Type check all packages
pnpm lint             # Lint all packages
pnpm lint:fix         # Auto-fix lint issues
pnpm test             # Run all tests
pnpm test:watch       # Run tests in watch mode

# Database
pnpm db:push          # Push schema changes (development)
pnpm db:generate      # Generate Prisma client
pnpm db:migrate       # Run migrations
pnpm db:studio        # Open Prisma Studio (via @moneio/db)

# Formatting
pnpm format           # Format all files
pnpm format:check     # Check formatting
```

### Running a single test

```bash
# Run tests for a specific package
pnpm --filter @moneio/web test
pnpm --filter @moneio/ai test

# Run a specific test file
pnpm --filter @moneio/domain test src/categorization/rules.test.ts
```

## Architecture

### Monorepo Structure

This is a pnpm workspace monorepo with Turborepo for build orchestration.

```
apps/
  web/       # Next.js 14 frontend with API routes
  worker/    # BullMQ background job processor

packages/
  core-ledger/  # Zero-dependency core types (Money, Currency, etc.)
  domain/       # Business logic and Zod schemas
  ai/           # AI adapters (extraction, categorization, chat)
  db/           # Prisma ORM with Supabase PostgreSQL
  ui/           # Shared React components (Radix UI + Tailwind)
  i18n/         # Internationalization (next-intl)
  utils/        # Shared utilities
```

### Package Dependency Rules

- `apps/*` can import from `packages/*`
- `core-ledger` has zero external dependencies - foundational types only
- `domain` imports `core-ledger`, not UI or DB
- `ai` imports `domain` and `core-ledger`, not DB directly
- `db` is used by `apps/web` and `apps/worker` only

### Document Processing Pipeline

Documents flow through a state machine with BullMQ jobs:

```
uploaded → processing → ocr_complete → extracting → ready
                                              ↓
                                           failed
```

Job types: `DOC_NORMALIZE` → `DOC_OCR` → `DOC_EXTRACT` → `DOC_POSTPROCESS`

### AI Layer Pattern

All AI outputs use the `AiProposal<T>` wrapper with:

- `data: T` - The extracted/suggested data
- `confidence: number` - 0-100 confidence score
- `evidence: AiEvidence[]` - Citations and bounding boxes
- `modelInfo` - Provider and model details

AI suggestions remain pending until user approval (human-in-the-loop).

### API Routes

API routes are Next.js App Router handlers in `apps/web/src/app/api/`:

- `/api/documents/*` - Document upload, listing, extraction approval
- `/api/transactions/*` - Bank transaction import and listing
- `/api/workspaces/*` - Workspace CRUD
- `/api/invoices/*` - Invoice management
- `/api/matches/*` - Invoice-transaction matching
- `/api/categories/*` - Category management
- `/api/rules/*` - Categorization rules

### Key Technologies

- **Frontend**: Next.js 14, React 18, Tailwind CSS, Radix UI
- **Database**: PostgreSQL (Supabase) with Prisma ORM
- **Queue**: BullMQ with Redis (Upstash)
- **AI**: OpenAI (configurable), Google Cloud Vision for OCR
- **Auth**: Supabase Auth

## Environment Setup

Two services need environment configuration:

1. `apps/web/.env.local` - Web app (copy from `apps/web/.env.example`)
2. `apps/worker/.env` - Worker (copy from `apps/worker/.env.example`)

Required services: Supabase, Upstash Redis, OpenAI, Google Cloud Vision

## Code Style

- ESLint with TypeScript, import ordering enforced
- Prettier for formatting
- Unused variables prefixed with `_` are allowed
- Strict TypeScript: `strictNullChecks`, `noImplicitAny`, `noUnusedLocals`
