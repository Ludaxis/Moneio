# ADR-0006: Serverless-First Architecture

## Status

Accepted

## Context

Moneio needs to scale from current state to thousands of users. Key architectural decisions are needed around:

1. **Deployment model**: Serverless (Vercel) vs containerized (K8s)
2. **Database connections**: How to handle connection pooling at scale
3. **Background jobs**: How workers integrate with serverless frontend
4. **Cost efficiency**: Optimize for variable traffic patterns

### Traffic Characteristics

- Accounting apps have variable traffic (spikes at month-end, year-end)
- Small team with limited ops capacity
- Startup stage with cost sensitivity

## Decision

Deploy on **Vercel serverless** with the following architecture:

### Frontend & API

- Next.js deployed on Vercel
- API routes as serverless functions
- Edge middleware for auth/rate limiting where applicable

### Database

- PostgreSQL on Supabase
- **Connection pooling via Supabase Pooler** (port 6543) for serverless
- Direct connections (port 5432) only for migrations

```env
# Serverless runtime - use pooler
DATABASE_URL="postgresql://user:pass@db.supabase.co:6543/postgres?pgbouncer=true&connection_limit=1"

# Migrations only - direct connection
DIRECT_URL="postgresql://user:pass@db.supabase.co:5432/postgres"
```

### Redis/Queue

- Upstash Redis for caching and rate limiting
- Upstash REST API for serverless-compatible queue operations
- BullMQ workers on separate container service (Railway/Render)

### Workers

- Long-running BullMQ workers deployed separately on Railway or Render
- Not on Vercel (10s function timeout is insufficient for document processing)
- Connected to same Supabase and Upstash instances

## Consequences

### Pros

- **Zero-config scaling**: Vercel auto-scales based on demand
- **Pay-per-request**: Cost-efficient for variable traffic
- **Minimal ops**: No Kubernetes expertise required
- **Fast deploys**: Preview deployments for PRs
- **Edge caching**: Static assets and ISR cached at edge

### Cons

- **Cold starts**: Initial request latency (~100-500ms)
- **Function timeouts**: 10s on Hobby, 60s on Pro (document extraction needs workers)
- **Connection limits**: Requires pooler for database connections
- **Vendor lock-in**: Some Vercel-specific optimizations

### Mitigations

1. **Cold starts**: Use `export const runtime = 'edge'` for latency-critical routes
2. **Timeouts**: All heavy processing (OCR, extraction) runs on dedicated workers
3. **Connections**: Prisma configured with `connection_limit=1` via pooler
4. **Lock-in**: Keep core business logic in `packages/domain` (framework-agnostic)

## Migration Path

Move to Kubernetes when:

- Infrastructure costs exceed ~$5k/month
- Real-time features require WebSockets (not just SSE)
- Compliance requires dedicated infrastructure
- Team has ops capacity for K8s management

## Alternatives Considered

### Container-first (K8s)

**Rejected** for current stage:

- Higher ops overhead
- Fixed costs regardless of traffic
- Overkill for current scale

### Hybrid (Vercel + Fly.io)

**Considered** for future:

- Workers could move to Fly.io for global distribution
- Currently Railway/Render is simpler and sufficient

## Related Decisions

- ADR-0002: Database ORM (Prisma with Supabase)
- ADR-0004: Document Ingestion Pipeline (BullMQ workers)
