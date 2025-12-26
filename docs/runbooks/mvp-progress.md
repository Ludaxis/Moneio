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

## T05: Supabase Auth integration + user row ✅

**Status:** Complete

### What's Done
- Supabase SSR client setup (server, browser, middleware)
- Magic link authentication on login page
- Auth callback handler with user bootstrap
- User bootstrap: creates `users` row on first login (id = auth uid)
- Protected route middleware (redirects to login if not authenticated)
- Session refresh in middleware
- Sign out server action

### How to Verify
```bash
# View Supabase client setup
cat apps/web/src/lib/supabase/server.ts

# View login page
cat apps/web/src/app/[locale]/(auth)/login/page.tsx

# View auth callback
cat apps/web/src/app/auth/callback/route.ts

# View user bootstrap
cat apps/web/src/lib/auth/user-bootstrap.ts
```

### Known Gaps
- Need NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY env vars
- User dropdown with sign out not yet in topbar (T06)

---

## T06: Workspace wizard + RBAC + switcher ✅

**Status:** Complete

### What's Done
- Workspace service with create/get/update functions
- RBAC system with owner/admin/member roles
- Role-based permissions (24 permissions across 8 categories)
- Workspace create wizard (name, base currency selection)
- Workspace switcher dropdown in topbar
- API routes for workspace CRUD
- User menu with sign out functionality
- Categories seeded on workspace creation

### How to Verify
```bash
# View workspace service
cat apps/web/src/lib/workspace/service.ts

# View RBAC system
cat apps/web/src/lib/workspace/rbac.ts

# View workspace switcher
cat apps/web/src/components/workspace/workspace-switcher.tsx

# View workspace wizard
cat apps/web/src/app/[locale]/(app)/workspace/new/page.tsx
```

### Known Gaps
- Member invitation flow (future enhancement)
- Workspace settings page (future enhancement)

---

## T07: Storage signed upload endpoints + document create ✅

**Status:** Complete

### What's Done
- Storage service with signed upload/read URLs
- Signed upload URL API endpoint
- Document creation with blob record
- Drag/drop file uploader component (mobile-friendly)
- Progress tracking during upload
- RBAC permission checks
- Queue stub for DOC_NORMALIZE (to be implemented in T09)
- Document service with CRUD operations

### How to Verify
```bash
# View storage service
cat apps/web/src/lib/storage/service.ts

# View document uploader component
cat apps/web/src/components/documents/document-uploader.tsx

# View API routes
cat apps/web/src/app/api/documents/route.ts
cat apps/web/src/app/api/documents/upload-url/route.ts
```

### Known Gaps
- Queue integration in T09
- Worker processing in T10-T14

---

## T08: Documents list + detail UI ✅

**Status:** Complete

### What's Done
- Documents list page with table view
- Status filter dropdown (all/uploaded/processing/ready/failed)
- Pagination with next/previous controls
- Document detail page with:
  - PDF/image viewer with zoom and rotate controls
  - Status banner with auto-refresh for processing documents
  - Document info panel (filename, type, size, pages, date)
  - Extraction data panel (placeholder for T15)
- Workspace context provider for shared workspace state
- API endpoint for single document fetch with signed view URL
- Full i18n support for all 4 locales (en, et, fa, ar)

### How to Verify
```bash
# View documents list page
cat apps/web/src/app/[locale]/(app)/documents/page.tsx

# View document detail page
cat apps/web/src/app/[locale]/(app)/documents/[id]/page.tsx

# View document viewer component
cat apps/web/src/components/documents/document-viewer.tsx

# View API endpoint
cat apps/web/src/app/api/documents/[id]/route.ts
```

### Known Gaps
- Extraction review UI will be implemented in T15
- Real document processing will be implemented in T09-T14

---

## T09: Worker bootstrap + queues (BullMQ + Upstash) ✅

**Status:** Complete

### What's Done
- Worker service with BullMQ + ioredis
- 6 queue workers configured:
  - DOC_NORMALIZE (document normalization)
  - DOC_OCR (Google Vision OCR - stub)
  - DOC_EXTRACT (LLM extraction - stub)
  - DOC_POSTPROCESS (post-processing - stub)
  - CATEGORIZATION (AI categorization - stub)
  - FX_FETCH (FX rate fetching - stub)
- Redis connection factory with Upstash TLS support
- Queue job types and result types
- Handler stubs for each queue (ready for implementation)
- Web app queue client for enqueueing jobs
- Documents API updated to enqueue DOC_NORMALIZE
- Graceful shutdown handling
- Scheduled recurring FX jobs
- Environment variable examples updated

### How to Verify
```bash
# View worker entry point
cat apps/worker/src/index.ts

# View queue definitions
cat apps/worker/src/lib/queues.ts

# View handler stubs
ls apps/worker/src/handlers/

# View web queue client
cat apps/web/src/lib/queue/client.ts
```

### Known Gaps
- All handlers are stubs - will be implemented in T10-T14, T18, T20
- Need REDIS_URL configured to actually enqueue jobs

---

## T10: DOC_NORMALIZE implementation ✅

**Status:** Complete

### What's Done
- Supabase storage client for worker (download/upload files)
- Document processor utility:
  - PDF page counting using pdf-lib
  - Image dimension parsing (PNG, JPEG, GIF)
  - Multi-page PDF extraction to individual pages
  - Image normalization (pass-through for MVP)
- Full DOC_NORMALIZE handler implementation:
  - Downloads original file from Supabase storage
  - Gets document info (page count, dimensions)
  - For multi-page PDFs: extracts each page, uploads separately
  - Creates blob records for each page
  - Enqueues DOC_OCR jobs for each page
  - Updates document status and page count
  - Error handling with document failure marking

### How to Verify
```bash
# View document processor
cat apps/worker/src/lib/document-processor.ts

# View storage client
cat apps/worker/src/lib/storage.ts

# View updated handler
cat apps/worker/src/handlers/doc-normalize.ts
```

### Known Gaps
- Image normalization passes through (no resize/conversion yet)
- For production: add sharp for image processing

---

## T11: DOC_OCR (Google Vision) ✅

**Status:** Complete

### What's Done
- OCR service with Google Cloud Vision API:
  - Supports PDF and image documents
  - Uses documentTextDetection for structured output
  - Multi-language support (en, et, ar, fa)
  - Parses blocks, paragraphs, and words with bounding boxes
  - Calculates confidence scores
  - Detects primary language
- Updated DOC_OCR handler:
  - Downloads file from storage
  - Calls Vision API with retry logic (3 attempts)
  - Stores OCR artifacts with full text and block structure
  - Tracks page completion and triggers extraction
  - Graceful fallback on OCR failure

### How to Verify
```bash
# View OCR service
cat apps/worker/src/lib/ocr.ts

# View updated handler
cat apps/worker/src/handlers/doc-ocr.ts
```

### Known Gaps
- Requires GOOGLE_CLOUD_CREDENTIALS env var
- No caching of Vision API results

---

## T12: packages/ai schemas + OpenAI adapter ✅

**Status:** Complete

### What's Done
- OpenAI LLM client implementing LlmClient interface:
  - `complete(prompt)` method with JSON mode
  - `getModelInfo()` for tracking/audit
- Factory functions:
  - `createOpenAiClient()` - gpt-4o-mini for extraction (cost-efficient)
  - `createOpenAiChatClient()` - gpt-4o for chat (better quality)
- Extraction schemas already in @moneio/domain:
  - invoiceExtractionSchema
  - receiptExtractionSchema
  - statementExtractionSchema
- Extractors already in @moneio/ai:
  - InvoiceExtractor
  - ReceiptExtractor
  - StatementExtractor
- Fixed worker type errors for Prisma compatibility

### How to Verify
```bash
# View OpenAI client
cat packages/ai/src/clients/openai.ts

# View extraction schemas
cat packages/domain/src/schemas/extraction.ts

# View extractors
cat packages/ai/src/extraction/invoice-extractor.ts
```

### Known Gaps
- Requires OPENAI_API_KEY env var
- No streaming support yet (T22)

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
