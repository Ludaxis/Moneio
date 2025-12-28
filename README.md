# Moneio - AI-First Accounting Assistant

An AI-powered accounting assistant for small businesses. Upload invoices and receipts, import bank statements, and get intelligent insights about your finances.

## Features

- **Document Extraction**: Upload PDFs and photos of invoices, receipts, and bank statements. AI extracts structured data automatically.
- **Smart Categorization**: Transactions are categorized automatically using AI with rules-based fallback.
- **Invoice Matching**: AI suggests matches between invoices and bank transactions.
- **Financial Chat**: Ask questions about your finances in plain language.
- **Multi-Currency**: Store original currencies, convert at reporting time.
- **VAT Tracking**: Track VAT collected and paid, with per-rate breakdowns.

## Architecture

```
/
├── apps/
│   ├── api/         # Hono API server
│   ├── worker/      # BullMQ background workers
│   └── web/         # Next.js frontend
├── packages/
│   ├── core-ledger/ # Zero-dependency core types
│   ├── domain/      # Business logic and Zod schemas
│   ├── ai/          # AI adapters (extraction, categorization, chat)
│   └── db/          # Drizzle ORM schemas
└── docs/
    └── adr/         # Architecture Decision Records
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 15+
- Redis (for background jobs)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd moneio

# Install dependencies
pnpm install

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Run database migrations
pnpm db:push

# Start development servers
pnpm dev
```

### Development Commands

```bash
pnpm dev          # Start all services in development mode
pnpm build        # Build all packages and apps
pnpm test         # Run tests
pnpm typecheck    # Type check all packages
pnpm lint         # Lint all packages
pnpm db:generate  # Generate database migrations
pnpm db:migrate   # Run database migrations
pnpm db:push      # Push schema to database (development)
```

## API Endpoints

### Implemented (Next.js API routes)

- `POST /api/documents/upload-url` — Get a signed upload URL for Supabase Storage
- `POST /api/documents` — Create a document record and enqueue processing
- `GET /api/documents` — List workspace documents
- `GET /api/documents/:id` — Get document details + signed view URL
- `PATCH /api/documents/:id/extraction` — Edit extracted payload (server-side review)
- `POST /api/documents/:id/extraction/approve` — Approve extraction and linked invoice
- `GET /api/transactions` — List bank transactions
- `POST /api/transactions/import` — Import bank transactions from CSV data
- `GET /api/workspaces` / `POST /api/workspaces` — Workspace listing/creation
- `GET /api/audit-log` — Workspace audit log entries

### Planned/Not Yet Implemented

The README previously listed invoice approval, reports, and chat endpoints for the planned Hono API service. These are not yet wired up; extend the API surface (or adjust the contract) before promising them to users.

## Technology Stack

- **Frontend**: Next.js 14, React 18, Tailwind CSS
- **Backend**: Hono, Node.js
- **Database**: PostgreSQL with Drizzle ORM
- **Queue**: BullMQ with Redis
- **AI**: OpenAI/Anthropic (configurable)
- **Build**: pnpm workspaces, Turborepo

## License

MIT
