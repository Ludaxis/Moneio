# ADR-0005: Hono for API Framework

## Status

Accepted

## Context

We need a lightweight, fast API framework that supports TypeScript, middleware, and can run on Node.js with potential for edge deployment.

## Decision

Use Hono as the API framework.

### Key Features

- Lightweight (~14kb), fast performance
- TypeScript-first with excellent inference
- Middleware ecosystem (cors, logger, zod-validator)
- Multi-runtime support (Node.js, Bun, Cloudflare Workers)
- OpenAPI generation capability

### Route Structure

```
apps/api/src/routes/
├── health.ts       # Health checks
├── documents.ts    # Document upload, status, approval
├── invoices.ts     # Invoice CRUD, status transitions
├── transactions.ts # Transaction listing, categorization
├── reports.ts      # Cashflow, VAT, dashboard
└── chat.ts         # Financial Q&A
```

### Validation

All request bodies validated with Zod using `@hono/zod-validator`.

## Consequences

Pros:

- Minimal overhead, fast cold starts
- Clean middleware composition
- Type-safe request/response handling
- Easy to test with standard fetch API

Cons:

- Smaller ecosystem than Express
- Less documentation than established frameworks
- Some middleware needs to be built custom

## Alternatives

- Express (rejected: heavier, slower, callback-based)
- Fastify (rejected: more complex, schema-based validation)
- tRPC (rejected: couples frontend/backend too tightly for our architecture)
