# MVP Progress Tracker

This document tracks progress on the MVP implementation, updated after each ticket is completed.

---

## T01: Turborepo scaffold + tooling baseline ✅

**Status:** Complete

### What's Done
- Monorepo structure with Turborepo
- All package directories created:
  - `apps/web` - Next.js web application
  - `apps/worker` - Background job processor
  - `packages/db` - Database layer (prepared for Prisma)
  - `packages/core-ledger` - Core types (no external dependencies)
  - `packages/domain` - Domain logic
  - `packages/ai` - AI adapters
  - `packages/ui` - Shared UI components
  - `packages/i18n` - Internationalization (en, et, fa, ar with RTL support)
  - `packages/utils` - Shared utilities
- ESLint + TypeScript configuration
- GitHub Actions CI pipeline (lint, typecheck, test, build)
- Environment variable examples for web and worker

### How to Verify
```bash
# Check directory structure
ls -la apps/ packages/

# View CI workflow
cat .github/workflows/ci.yml

# View ESLint config
cat .eslintrc.json

# View env examples
cat apps/web/.env.example
cat apps/worker/.env.example
```

### Known Gaps
- Need to install dependencies with `pnpm install`
- packages/db still has old Drizzle config (will be replaced in T02)

---

## T02: Prisma baseline (packages/db) ✅

**Status:** Complete

### What's Done
- Replaced Drizzle with Prisma ORM
- Created `prisma/schema.prisma` with full MVP schema:
  - Core: users, workspaces, workspace_members
  - Documents: documents, document_blobs, ocr_artifacts, extractions
  - Financial: merchants, invoices, invoice_line_items, bank_accounts, bank_transactions
  - Categorization: categories, transaction_categorizations, rules
  - Matching: matches
  - AI: ai_suggestions
  - Audit/FX: audit_log, fx_rates
- Created Prisma client singleton with logging config
- Created health check helper for database connectivity
- All tables have proper indexes for workspace_id scoping

### How to Verify
```bash
# View Prisma schema
cat packages/db/prisma/schema.prisma

# View client singleton
cat packages/db/src/client.ts

# View health check helper
cat packages/db/src/health.ts

# After installing deps, generate Prisma client
pnpm db:generate
```

### Known Gaps
- Need to run `pnpm install` then `pnpm db:generate` to create Prisma client
- Seed script will be added in T03

---

## T03: MVP schema + indexes + seed ✅

**Status:** Complete

### What's Done
- Full MVP schema implemented in T02 with all tables:
  - users, workspaces, workspace_members
  - documents, document_blobs, ocr_artifacts, extractions
  - merchants, invoices, invoice_line_items
  - bank_accounts, bank_transactions
  - categories, transaction_categorizations, rules
  - matches, ai_suggestions, audit_log, fx_rates
- Indexes added:
  - (workspace_id, created_at) on documents, audit_log
  - (workspace_id, status) on documents
  - (workspace_id, posted_at) on bank_transactions
  - unique(workspace_id, tx_hash) on bank_transactions
  - (workspace_id, suggestion_type, status) on ai_suggestions
  - (entity_type, entity_id) on audit_log
- Seed script created with:
  - 28 default categories (Income, COGS, OPEX, Tax, Equity, Transfer)
  - Demo workspace with EUR as base currency
  - Demo user for development testing

### How to Verify
```bash
# View seed script
cat packages/db/prisma/seed.ts

# After connecting to a database, run seed
pnpm db:seed
```

### Known Gaps
- None - ready for database connection

---

## T04: Web bootstrap (Next.js + next-intl + RTL) ✅

**Status:** Complete

### What's Done
- Next.js 14 App Router with next-intl
- Locale-based routing: `/{locale}/...` (en, et, fa, ar)
- RTL support for fa/ar via `<html dir="rtl">`
- Fonts: Inter (Latin), Vazirmatn (Persian), Noto Sans Arabic
- Tailwind CSS with design tokens (shadcn/ui compatible)
- Base layout with collapsible sidebar skeleton
- Topbar with search, workspace switcher, notifications
- Dashboard page skeleton with stats cards
- Translation files for all 4 locales
- `tabular-nums` and `financial-number` utilities for numbers
- Reduced motion support

### How to Verify
```bash
# View locale layout
cat apps/web/src/app/[locale]/layout.tsx

# View sidebar component
cat apps/web/src/components/layout/sidebar.tsx

# View tailwind config
cat apps/web/tailwind.config.ts

# View message files
ls apps/web/messages/
```

### Known Gaps
- Need to install dependencies with `pnpm install`
- Auth not yet integrated (T05)

---

## T05: Supabase Auth integration + user row
**Status:** Pending

---

## T06: Workspace wizard + RBAC + switcher
**Status:** Pending

---

## T07: Storage signed upload endpoints + document create
**Status:** Pending

---

## T08: Documents list + detail UI
**Status:** Pending

---

## T09: Worker bootstrap + queues (BullMQ + Upstash)
**Status:** Pending

---

## T10: DOC_NORMALIZE implementation
**Status:** Pending

---

## T11: DOC_OCR (Google Vision)
**Status:** Pending

---

## T12: packages/ai schemas + OpenAI adapter
**Status:** Pending

---

## T13: DOC_EXTRACT worker job
**Status:** Pending

---

## T14: DOC_POSTPROCESS worker job
**Status:** Pending

---

## T15: Extraction review UI + audit log
**Status:** Pending

---

## T16: CSV import wizard UI
**Status:** Pending

---

## T17: CSV parse/normalize backend
**Status:** Pending

---

## T18: Tx categorization suggestions
**Status:** Pending

---

## T19: Matching suggestions UI
**Status:** Pending

---

## T20: FX_FETCH job + FX utilities
**Status:** Pending

---

## T21: Dashboard + Reports
**Status:** Pending

---

## T22: Chat API with citations
**Status:** Pending

---

## T23: Observability + tests
**Status:** Pending

---

## T24: Deployment runbooks + smoke checklist
**Status:** Pending
