# ADR-0002: Drizzle ORM for Database Access

## Status
Accepted

## Context
We need a database access layer that supports PostgreSQL, provides type safety, and integrates well with our TypeScript codebase. The data model includes users, workspaces, documents, financial entities, and AI suggestions.

## Decision
Use Drizzle ORM for database access.

### Key Features Used
- Schema-as-code with TypeScript inference
- PostgreSQL-native features (UUID, JSONB, enums)
- Relation definitions for complex queries
- Migration generation with drizzle-kit

### Schema Organization
```
packages/db/src/schema/
├── core.ts        # users, workspaces, workspace_members
├── documents.ts   # documents, blobs, ocr_artifacts, extractions
├── financial.ts   # merchants, invoices, transactions, categories
├── categorization.ts # rules, matches, transaction_categorizations
├── ai.ts          # ai_suggestions, audit_log
└── relations.ts   # Drizzle relation definitions
```

## Consequences

Pros:
- Full TypeScript type safety from schema to query
- Lightweight, minimal runtime overhead
- SQL-like query builder (familiar to SQL developers)
- Excellent PostgreSQL feature support
- Schema changes generate clean migrations

Cons:
- Smaller ecosystem than Prisma
- Less abstraction (more SQL knowledge required)
- Relation handling requires explicit configuration

## Alternatives
- Prisma (rejected: heavier runtime, schema DSL adds indirection)
- TypeORM (rejected: decorator-based approach, complex configuration)
- Knex (rejected: less type-safe, more boilerplate)
