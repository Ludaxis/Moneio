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

## T02: Prisma baseline (packages/db)
**Status:** Pending

---

## T03: MVP schema + indexes + seed
**Status:** Pending

---

## T04: Web bootstrap (Next.js + next-intl + RTL)
**Status:** Pending

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
