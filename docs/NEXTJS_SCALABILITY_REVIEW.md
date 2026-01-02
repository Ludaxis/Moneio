# Next.js Scalability Review: Moneio

**Author**: Principal Software Engineer Review
**Date**: January 2025
**Scope**: Full codebase evaluation for scaling to thousands of users

---

## Executive Summary

Moneio is an AI-powered accounting assistant with a solid monorepo foundation. However, the frontend is **client-heavy with manual fetch waterfalls**, API handlers **mix concerns** (HTTP, auth, business logic, Prisma), and **infrastructure choices are incompatible** with serverless at scale.

**Current Grade: B**
**Target Grade: A+**

### Critical Decisions Required

Before implementing improvements, the team must decide:

1. **Serverless (Vercel) vs Containerized (K8s)?** — This affects every infrastructure choice
2. **RSC-first or client-first?** — Current client-heavy approach won't scale
3. **Service layer extraction?** — API routes are doing too much

---

## Table of Contents

1. [Current State Assessment](#part-1-current-state-assessment)
2. [Critical Issues](#part-2-critical-issues)
3. [Architectural Decisions](#part-3-architectural-decisions)
4. [The Improvement Plan](#part-4-the-improvement-plan)
5. [Target Architecture](#part-5-target-architecture)
6. [Test Strategy](#part-6-test-strategy)
7. [AI/ML Safety & Cost Controls](#part-7-aiml-safety--cost-controls)
8. [Team Workflow](#part-8-team-workflow)

---

## Part 1: Current State Assessment

### Strengths ✅

| Area | Status | Evidence |
|------|--------|----------|
| Monorepo Architecture | ✅ Excellent | Clear package boundaries, Turborepo caching |
| Zero-Dependency Core | ✅ Excellent | `core-ledger` has zero external deps |
| Type Safety | ✅ Excellent | Strict TS + Zod runtime validation |
| Human-in-the-Loop AI | ✅ Excellent | `AiProposal<T>` with confidence scores |
| i18n with RTL | ✅ Excellent | Arabic/Persian support |
| Worker Shutdown | ✅ Good | Graceful SIGTERM handling |
| Upstash Optimization | ✅ Good | 5s drain delay reduces API calls 1000x |

### Weaknesses 🔴

| Area | Issue | Impact |
|------|-------|--------|
| Frontend Architecture | Client-heavy, useEffect waterfalls | High TTI, duplicate logic |
| API Design | Mixed concerns in route handlers | Hard to test/reuse |
| Database Access | Prisma in routes, no pooling | Connection exhaustion |
| Queue Reliability | No DLQ, no idempotency | Duplicate work on retry |
| Auth | Inconsistent, no tenant quotas | Security gaps |
| Observability | Only in worker, not web | Blind spots |
| Testing | Sparse unit tests only | Low confidence |
| Documentation | README references Drizzle/Hono | Confusion for new devs |
| Dependencies | Duplicate ElevenLabs packages | Bundle bloat |

---

## Part 2: Critical Issues

### Issue 1: Client-Heavy Frontend 🔴 CRITICAL

**Current pattern** (wrong for 2025):
```typescript
// apps/web/src/app/[locale]/(app)/dashboard/page.tsx
'use client';

export default function DashboardPage() {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/metrics')
      .then(res => res.json())
      .then(setMetrics)
      .finally(() => setLoading(false));
  }, [workspaceId]);

  // More fetches...
}
```

**Problems:**
- Data fetching on client = larger bundle, slower TTI
- Manual loading states = duplicated logic across pages
- No request deduplication = wasted bandwidth
- No streaming = users wait for everything

**Correct pattern** (RSC-first):
```typescript
// apps/web/src/app/[locale]/(app)/dashboard/page.tsx
import { Suspense } from 'react';
import { getDashboardMetrics } from '@/services/dashboard';

export default async function DashboardPage({ searchParams }) {
  const { workspaceId } = await searchParams;

  return (
    <div className="grid gap-6">
      <Suspense fallback={<MetricsSkeleton />}>
        <DashboardMetrics workspaceId={workspaceId} />
      </Suspense>
      <Suspense fallback={<TransactionsSkeleton />}>
        <RecentTransactions workspaceId={workspaceId} />
      </Suspense>
    </div>
  );
}

// Server Component - fetches on server, streams to client
async function DashboardMetrics({ workspaceId }: { workspaceId: string }) {
  const metrics = await getDashboardMetrics(workspaceId);
  return <MetricsGrid metrics={metrics} />;
}
```

### Issue 2: API Routes Mix All Concerns 🔴 CRITICAL

**Current pattern** (`apps/web/src/app/api/transactions/route.ts`):
```typescript
export async function GET(request: Request) {
  // HTTP concern
  const url = new URL(request.url);
  const params = Object.fromEntries(url.searchParams);

  // Auth concern
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Validation concern
  const parsed = listQuerySchema.safeParse(params);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid' }, { status: 400 });

  // Permission concern
  const canRead = await hasPermission(user.id, workspaceId, 'transaction:read');
  if (!canRead) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Business logic + data access (mixed!)
  const transactions = await prisma.bankTransaction.findMany({
    where: { workspaceId },
    include: { categorizations: true },
    orderBy: { postedAt: 'desc' },
    skip: (page - 1) * pageSize,
    take: pageSize,
  });

  // Serialization concern
  return NextResponse.json({
    items: transactions.map(t => ({
      ...t,
      amount: serializeDecimal(t.amount),
    })),
  });
}
```

**Problems:**
- 860-line chat route is unmaintainable
- Can't unit test business logic without HTTP
- Permission checks copy-pasted across 67+ routes
- Prisma models leak to API responses

### Issue 3: No Idempotency in Queue Jobs 🔴 CRITICAL

**Current pattern** (`apps/worker/src/index.ts`):
```typescript
await queue.add('doc-extract', { documentId });
// If job fails and retries, extraction runs twice
// No way to prevent duplicate invoices
```

**Impact:**
- Retry = duplicate work
- Failed jobs lost (no DLQ)
- No visibility into job failures

### Issue 4: Database Connections in Serverless 🟡 HIGH

**Current pattern** (`packages/db/src/client.ts`):
```typescript
export const prisma = global.prisma || new PrismaClient();
```

**Problems in serverless:**
- Each cold start = new connection
- 1000 concurrent requests = 1000 connections
- PostgreSQL max_connections exhausted
- No pgBouncer/Data Proxy configured

### Issue 5: Inconsistent Authorization 🟡 HIGH

**Evidence:**
- `withWorkspace` exists but some routes use ad-hoc checks
- `chat/route.ts` and `voice/route.ts` have no rate limiting
- No tenant-level quotas for AI operations
- Supabase service-role used for signed URLs with no client-side guard

### Issue 6: Observability Gap 🟡 HIGH

**Current state:**
- `packages/observability/integrations/nextjs.ts` exists but isn't used
- Worker has Datadog LLM tracing
- Web app has no request tracing
- No trace propagation from API → Worker jobs

### Issue 7: Documentation Drift 🟠 MEDIUM

**README.md** still references:
- Drizzle (code uses Prisma)
- Hono (code uses Next.js route handlers)

**package.json** has duplicates:
- `@11labs/react` AND `@elevenlabs/react`

---

## Part 3: Architectural Decisions

### Decision 1: Serverless vs Containerized

**This must be decided first** — it affects everything else.

| Aspect | Serverless (Vercel) | Containerized (K8s) |
|--------|---------------------|---------------------|
| **Database** | Prisma Data Proxy or pgBouncer | Direct connections OK |
| **Queues** | Upstash REST Queue | BullMQ + ioredis fine |
| **Workers** | Vercel Functions (limited) | Long-running pods |
| **Scaling** | Automatic, pay-per-request | Manual, fixed cost |
| **Cold starts** | Yes, optimize for it | No |
| **Best for** | Variable traffic, low ops | Predictable traffic, full control |

**Recommendation:** Start with Vercel serverless, plan migration path to K8s when traffic justifies dedicated infrastructure.

### Decision 2: Service Layer Architecture

Extract business logic from API routes into a service layer:

```
packages/
  app-services/           # NEW: Application layer
    src/
      transactions/
        service.ts        # Business logic + permissions
        repository.ts     # Prisma access (only place touching DB)
        dto.ts           # API contracts (what routes return)
        mapper.ts        # Entity ↔ DTO conversion
      documents/
        service.ts
        repository.ts
      shared/
        tenant-context.ts # Auth + workspace + rate limit
```

**Benefits:**
- Routes become thin adapters (< 50 lines)
- Business logic is unit testable
- Prisma models never leak to API
- Permission checks in one place

### Decision 3: RSC-First Data Fetching

Replace client-side fetching with React Server Components:

| Pattern | Use Case |
|---------|----------|
| RSC + `cache()` | Read-heavy pages (dashboard, lists) |
| Server Actions | Mutations (create, update, delete) |
| Client + React Query | Interactive islands (chat, real-time) |

```typescript
// packages/app-services/src/dashboard/service.ts
import { cache } from 'react';

export const getDashboardMetrics = cache(async (workspaceId: string) => {
  // This is automatically deduplicated within a request
  const [cashflow, transactions, invoices] = await Promise.all([
    getCashflow(workspaceId),
    getRecentTransactions(workspaceId),
    getPendingInvoices(workspaceId),
  ]);
  return { cashflow, transactions, invoices };
});
```

---

## Part 4: The Improvement Plan

### Phase 0: Foundation Decisions (Week 0)

**Deliverables:**
1. ✅ Decide serverless vs containerized
2. ✅ Document decision in ADR
3. ✅ Update README to match current stack

### Phase 1: Service Layer & RSC (Weeks 1-3)

#### 1.1 Create App Services Package

```bash
mkdir -p packages/app-services/src/{transactions,documents,dashboard,shared}
```

```typescript
// packages/app-services/src/shared/tenant-context.ts
import { headers } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server';
import { rateLimit } from './rate-limit';
import { audit } from './audit';

export interface TenantContext {
  user: User;
  workspaceId: string;
  workspace: Workspace;
}

export async function getTenantContext(): Promise<TenantContext> {
  const headersList = await headers();
  const workspaceId = headersList.get('x-workspace-id');

  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) throw new UnauthorizedError('Not authenticated');
  if (!workspaceId) throw new ValidationError('Workspace required');

  const workspace = await getWorkspaceWithPermission(user.id, workspaceId);
  if (!workspace) throw new ForbiddenError('No access to workspace');

  return { user, workspaceId, workspace };
}

export async function withTenantContext<T>(
  fn: (ctx: TenantContext) => Promise<T>,
  options?: { rateLimit?: string; audit?: boolean }
): Promise<T> {
  const ctx = await getTenantContext();

  if (options?.rateLimit) {
    await rateLimit.check(ctx.user.id, options.rateLimit);
  }

  const result = await fn(ctx);

  if (options?.audit) {
    await audit.log(ctx, 'action');
  }

  return result;
}
```

#### 1.2 Extract Transaction Service

```typescript
// packages/app-services/src/transactions/repository.ts
import { prisma } from '@moneio/db';

export class TransactionRepository {
  async findByWorkspace(
    workspaceId: string,
    options: { cursor?: string; limit?: number }
  ) {
    const { cursor, limit = 20 } = options;

    return prisma.bankTransaction.findMany({
      where: {
        workspaceId,
        ...(cursor && { id: { lt: cursor } }),
      },
      orderBy: { id: 'desc' },
      take: limit + 1,
      include: {
        categorizations: {
          where: { approved: true },
          take: 1,
          include: { category: true },
        },
      },
    });
  }
}

// packages/app-services/src/transactions/service.ts
import { cache } from 'react';
import { TransactionRepository } from './repository';
import { toTransactionDto } from './mapper';

const repo = new TransactionRepository();

export const getTransactions = cache(async (
  workspaceId: string,
  options: { cursor?: string; limit?: number }
) => {
  const { limit = 20 } = options;
  const transactions = await repo.findByWorkspace(workspaceId, options);

  const hasMore = transactions.length > limit;
  const items = hasMore ? transactions.slice(0, -1) : transactions;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return {
    items: items.map(toTransactionDto),
    nextCursor,
    hasMore,
  };
});
```

#### 1.3 Convert Dashboard to RSC

```typescript
// apps/web/src/app/[locale]/(app)/dashboard/page.tsx
import { Suspense } from 'react';
import { getTenantContext } from '@moneio/app-services/shared';
import { getDashboardMetrics } from '@moneio/app-services/dashboard';

export default async function DashboardPage() {
  const { workspaceId } = await getTenantContext();

  return (
    <div className="space-y-6">
      {/* Each section streams independently */}
      <Suspense fallback={<KPISkeleton />}>
        <KPISection workspaceId={workspaceId} />
      </Suspense>

      <div className="grid grid-cols-2 gap-6">
        <Suspense fallback={<ChartSkeleton />}>
          <CashflowChart workspaceId={workspaceId} />
        </Suspense>
        <Suspense fallback={<ChartSkeleton />}>
          <ExpensesChart workspaceId={workspaceId} />
        </Suspense>
      </div>

      <Suspense fallback={<TableSkeleton />}>
        <RecentTransactions workspaceId={workspaceId} />
      </Suspense>
    </div>
  );
}

async function KPISection({ workspaceId }: { workspaceId: string }) {
  const metrics = await getDashboardMetrics(workspaceId);
  return <KPIGrid metrics={metrics} />;
}
```

#### 1.4 Thin API Routes

```typescript
// apps/web/src/app/api/transactions/route.ts
import { NextResponse } from 'next/server';
import { getTransactions } from '@moneio/app-services/transactions';
import { withTenantContext } from '@moneio/app-services/shared';
import { listQuerySchema } from './schema';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = listQuerySchema.parse(Object.fromEntries(url.searchParams));

  const result = await withTenantContext(
    (ctx) => getTransactions(ctx.workspaceId, query),
    { rateLimit: 'api' }
  );

  return NextResponse.json(result);
}
```

### Phase 2: Infrastructure Hardening (Weeks 4-5)

#### 2.1 Database Connection Pooling

For Vercel/serverless:
```env
# Direct connection for migrations
DIRECT_URL="postgresql://user:pass@db.supabase.co:5432/postgres"

# Supabase Pooler for runtime (port 6543)
DATABASE_URL="postgresql://user:pass@db.supabase.co:6543/postgres?pgbouncer=true&connection_limit=1"
```

```prisma
// packages/db/prisma/schema.prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

#### 2.2 Queue Idempotency & DLQ

```typescript
// apps/worker/src/lib/queues.ts
import { Queue, Worker, QueueEvents } from 'bullmq';

const DLQ_NAME = 'dead-letter-queue';
const dlq = new Queue(DLQ_NAME, { connection });

export function createQueueWithDLQ(name: string) {
  const queue = new Queue(name, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: false, // Keep for DLQ
    },
  });

  return queue;
}

// Idempotent job creation
export async function enqueueDocExtract(data: DocExtractJobData) {
  const idempotencyKey = `extract-${data.documentId}-${data.version}`;

  // Check if job already exists or completed
  const existing = await docExtractQueue.getJob(idempotencyKey);
  if (existing) {
    console.log(`Job ${idempotencyKey} already exists, skipping`);
    return existing.id;
  }

  const job = await docExtractQueue.add('extract', data, {
    jobId: idempotencyKey,
  });

  return job.id;
}

// DLQ handler
export function setupDLQHandler() {
  const queueEvents = new QueueEvents('doc-extract', { connection });

  queueEvents.on('failed', async ({ jobId, failedReason }) => {
    const job = await docExtractQueue.getJob(jobId);
    if (!job) return;

    // Move to DLQ after final failure
    if (job.attemptsMade >= job.opts.attempts!) {
      await dlq.add('failed-job', {
        originalQueue: 'doc-extract',
        jobId,
        data: job.data,
        error: failedReason,
        failedAt: new Date().toISOString(),
      });

      // Alert on-call
      await alertOnCall({
        severity: 'high',
        message: `Job ${jobId} moved to DLQ after ${job.attemptsMade} attempts`,
        error: failedReason,
      });
    }
  });
}
```

#### 2.3 Rate Limiting with Tenant Quotas

```typescript
// packages/app-services/src/shared/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// Per-user limits
const userLimiters = {
  api: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, '1m'),
    prefix: 'rl:user:api',
  }),
  ai: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, '1m'),
    prefix: 'rl:user:ai',
  }),
};

// Per-workspace limits (shared across team)
const workspaceLimiters = {
  ai: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, '1m'),
    prefix: 'rl:ws:ai',
  }),
  upload: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(50, '1m'),
    prefix: 'rl:ws:upload',
  }),
};

export async function checkRateLimit(
  userId: string,
  workspaceId: string,
  limiterType: 'api' | 'ai' | 'upload'
) {
  // Check user limit
  const userResult = await userLimiters[limiterType === 'upload' ? 'api' : limiterType]
    .limit(userId);

  if (!userResult.success) {
    throw new RateLimitError('User rate limit exceeded', {
      retryAfter: userResult.reset,
    });
  }

  // Check workspace limit for expensive operations
  if (limiterType === 'ai' || limiterType === 'upload') {
    const wsResult = await workspaceLimiters[limiterType].limit(workspaceId);

    if (!wsResult.success) {
      throw new RateLimitError('Workspace rate limit exceeded', {
        retryAfter: wsResult.reset,
      });
    }
  }
}
```

#### 2.4 Unified Auth Wrapper

```typescript
// packages/app-services/src/shared/with-api.ts
import { NextResponse } from 'next/server';
import { ZodSchema } from 'zod';
import { getTenantContext, TenantContext } from './tenant-context';
import { checkRateLimit } from './rate-limit';
import { auditLog } from './audit';

interface ApiOptions<TQuery, TBody> {
  query?: ZodSchema<TQuery>;
  body?: ZodSchema<TBody>;
  rateLimit?: 'api' | 'ai' | 'upload';
  permission?: string;
  audit?: boolean;
}

type ApiHandler<TQuery, TBody, TResult> = (
  ctx: TenantContext & { query: TQuery; body: TBody }
) => Promise<TResult>;

export function withApi<TQuery = unknown, TBody = unknown, TResult = unknown>(
  options: ApiOptions<TQuery, TBody>,
  handler: ApiHandler<TQuery, TBody, TResult>
) {
  return async (request: Request) => {
    try {
      // 1. Get tenant context (auth + workspace)
      const ctx = await getTenantContext();

      // 2. Rate limit
      if (options.rateLimit) {
        await checkRateLimit(ctx.user.id, ctx.workspaceId, options.rateLimit);
      }

      // 3. Permission check
      if (options.permission) {
        const hasPermission = await checkPermission(
          ctx.user.id,
          ctx.workspaceId,
          options.permission
        );
        if (!hasPermission) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
      }

      // 4. Parse query
      let query = {} as TQuery;
      if (options.query) {
        const url = new URL(request.url);
        const parsed = options.query.safeParse(
          Object.fromEntries(url.searchParams)
        );
        if (!parsed.success) {
          return NextResponse.json(
            { error: 'Invalid query', details: parsed.error.flatten() },
            { status: 400 }
          );
        }
        query = parsed.data;
      }

      // 5. Parse body
      let body = {} as TBody;
      if (options.body) {
        const json = await request.json().catch(() => ({}));
        const parsed = options.body.safeParse(json);
        if (!parsed.success) {
          return NextResponse.json(
            { error: 'Invalid body', details: parsed.error.flatten() },
            { status: 400 }
          );
        }
        body = parsed.data;
      }

      // 6. Execute handler
      const result = await handler({ ...ctx, query, body });

      // 7. Audit log
      if (options.audit) {
        await auditLog(ctx, request.method, request.url);
      }

      return NextResponse.json(result);

    } catch (error) {
      if (error instanceof UnauthorizedError) {
        return NextResponse.json({ error: error.message }, { status: 401 });
      }
      if (error instanceof ForbiddenError) {
        return NextResponse.json({ error: error.message }, { status: 403 });
      }
      if (error instanceof ValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      if (error instanceof RateLimitError) {
        return NextResponse.json(
          { error: error.message, retryAfter: error.retryAfter },
          { status: 429, headers: { 'Retry-After': String(error.retryAfter) } }
        );
      }

      console.error('API error:', error);
      return NextResponse.json({ error: 'Internal error' }, { status: 500 });
    }
  };
}
```

Usage:
```typescript
// apps/web/src/app/api/transactions/route.ts
import { withApi } from '@moneio/app-services/shared';
import { getTransactions } from '@moneio/app-services/transactions';
import { listQuerySchema } from './schema';

export const GET = withApi(
  {
    query: listQuerySchema,
    rateLimit: 'api',
    permission: 'transaction:read',
  },
  async ({ workspaceId, query }) => {
    return getTransactions(workspaceId, query);
  }
);
```

### Phase 3: Observability (Weeks 6-7)

#### 3.1 Wire OpenTelemetry in Web App

```typescript
// apps/web/instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initTracing } = await import('@moneio/observability');
    initTracing('moneio-web');
  }
}
```

```typescript
// packages/observability/src/tracing/index.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

export function initTracing(serviceName: string) {
  const sdk = new NodeSDK({
    resource: new Resource({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: process.env.npm_package_version || '0.0.0',
    }),
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
      headers: {
        'DD-API-KEY': process.env.DD_API_KEY!,
      },
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
}
```

#### 3.2 Trace Propagation to Workers

```typescript
// apps/web/src/lib/queue/client.ts
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

export async function enqueueDocExtract(data: DocExtractJobData) {
  const tracer = trace.getTracer('moneio-web');

  return tracer.startActiveSpan('enqueue.doc-extract', async (span) => {
    try {
      // Inject trace context into job data
      const traceContext = {};
      trace.propagation.inject(context.active(), traceContext);

      const job = await docExtractQueue.add('extract', {
        ...data,
        _traceContext: traceContext,
      });

      span.setAttribute('job.id', job.id!);
      return job.id;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  });
}
```

```typescript
// apps/worker/src/handlers/doc-extract.ts
import { trace, context } from '@opentelemetry/api';

export async function handleDocExtract(job: Job<DocExtractJobData>) {
  const tracer = trace.getTracer('moneio-worker');

  // Extract trace context from job data
  const parentContext = trace.propagation.extract(
    context.active(),
    job.data._traceContext || {}
  );

  return context.with(parentContext, () => {
    return tracer.startActiveSpan('worker.doc-extract', async (span) => {
      span.setAttribute('document.id', job.data.documentId);

      // ... extraction logic

      span.end();
    });
  });
}
```

#### 3.3 Structured Logging with Request IDs

```typescript
// packages/observability/src/logging/index.ts
import pino from 'pino';
import { trace } from '@opentelemetry/api';

export function createLogger(name: string) {
  return pino({
    name,
    level: process.env.LOG_LEVEL || 'info',
    formatters: {
      log: (obj) => {
        const span = trace.getActiveSpan();
        if (span) {
          const ctx = span.spanContext();
          return {
            ...obj,
            traceId: ctx.traceId,
            spanId: ctx.spanId,
          };
        }
        return obj;
      },
    },
  });
}
```

### Phase 4: Caching Strategy (Week 8)

#### 4.1 Server-Side Caching with Tags

```typescript
// packages/app-services/src/categories/service.ts
import { unstable_cache, revalidateTag } from 'next/cache';
import { CategoryRepository } from './repository';

const repo = new CategoryRepository();

export const getCategories = unstable_cache(
  async (workspaceId: string) => {
    return repo.findByWorkspace(workspaceId);
  },
  ['categories'],
  {
    revalidate: 300, // 5 minutes
    tags: ['categories'],
  }
);

export async function createCategory(workspaceId: string, data: CreateCategoryInput) {
  const category = await repo.create(workspaceId, data);

  // Invalidate cache
  revalidateTag('categories');
  revalidateTag(`workspace:${workspaceId}`);

  return category;
}
```

#### 4.2 Redis Caching for Read-Heavy Data

```typescript
// packages/app-services/src/shared/cache.ts
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  ttlSeconds: number = 300
): Promise<T> {
  // Try cache
  const cached = await redis.get<T>(key);
  if (cached) return cached;

  // Compute and cache
  const result = await fn();
  await redis.setex(key, ttlSeconds, JSON.stringify(result));

  return result;
}

export async function invalidate(pattern: string) {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
```

#### 4.3 Cursor Pagination

```typescript
// packages/domain/src/schemas/pagination.ts
import { z } from 'zod';

export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export type CursorPagination = z.infer<typeof cursorPaginationSchema>;

export interface CursorPaginatedResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
```

---

## Part 5: Target Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CDN (Vercel Edge)                               │
│                    Static assets, Edge caching, WAF                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Next.js App (RSC-first)                           │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         Server Components                             │   │
│  │   • Data fetching via app-services                                    │   │
│  │   • Streaming with Suspense                                           │   │
│  │   • cache() for request deduplication                                 │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │  Thin API       │  │  Server         │  │  Client         │              │
│  │  Routes         │  │  Actions        │  │  Islands        │              │
│  │  (validation)   │  │  (mutations)    │  │  (interactive)  │              │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘              │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         packages/app-services                                │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │  Tenant Context │  │  Rate Limiting  │  │  Audit Logging  │              │
│  │  (auth + ws)    │  │  (per user/ws)  │  │                 │              │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘              │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐              │
│  │  Transaction    │  │  Document       │  │  Dashboard      │              │
│  │  Service        │  │  Service        │  │  Service        │              │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘              │
│                          │                                                   │
│                          ▼                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                        Repository Layer                              │    │
│  │                   (Prisma access, DTO mapping)                       │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
           ┌────────────────────────────┼────────────────────────────┐
           │                            │                            │
           ▼                            ▼                            ▼
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│   PostgreSQL     │        │      Redis       │        │    Job Queues    │
│   (Supabase)     │        │   (Upstash)      │        │   (Upstash)      │
│  ┌────────────┐  │        │  ┌────────────┐  │        │  ┌────────────┐  │
│  │ Pooler     │  │        │  │ Cache      │  │        │  │ DLQ        │  │
│  │ (6543)     │  │        │  │ Rate Limit │  │        │  │ Idempotent │  │
│  └────────────┘  │        │  └────────────┘  │        │  └────────────┘  │
└──────────────────┘        └──────────────────┘        └────────┬─────────┘
                                                                  │
                                                                  ▼
                                                   ┌──────────────────────────┐
                                                   │   Workers (containerized) │
                                                   │  ┌──────────────────────┐│
                                                   │  │ Trace propagation    ││
                                                   │  │ Idempotency checks   ││
                                                   │  │ Circuit breakers     ││
                                                   │  └──────────────────────┘│
                                                   └──────────────────────────┘
                                                                  │
                            ┌─────────────────────────────────────┼───────────┐
                            │                                     │           │
                            ▼                                     ▼           ▼
                 ┌──────────────────┐                  ┌──────────────────┐
                 │   Google Vision  │                  │   OpenAI/Gemini  │
                 │   + Eval Suite   │                  │   + Eval Suite   │
                 └──────────────────┘                  └──────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          Observability (Datadog)                             │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐                 │
│  │ OpenTelemetry  │  │  LLM Metrics   │  │    Alerts      │                 │
│  │ (web+worker)   │  │  (cost/tokens) │  │  (SLOs)        │                 │
│  └────────────────┘  └────────────────┘  └────────────────┘                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 6: Test Strategy

### Test Pyramid

```
                         ┌───────────┐
                         │   E2E     │  Playwright
                         │  (5-10)   │  Critical user flows
                        ┌┴───────────┴┐
                        │  Contract   │  API DTOs
                        │   (20-30)   │  OpenAPI validation
                       ┌┴─────────────┴┐
                       │  Integration  │  Testcontainers
                       │   (50-100)    │  Postgres + Redis
                      ┌┴───────────────┴┐
                      │      Unit       │  Vitest
                      │   (200-500)     │  Domain services
                     └──────────────────┘
```

### 6.1 Unit Tests (Domain Services)

```typescript
// packages/app-services/src/transactions/__tests__/service.test.ts
import { describe, it, expect, vi } from 'vitest';
import { TransactionService } from '../service';
import { TransactionRepository } from '../repository';

vi.mock('../repository');

describe('TransactionService', () => {
  const mockRepo = vi.mocked(TransactionRepository);

  describe('getTransactions', () => {
    it('returns paginated results with cursor', async () => {
      mockRepo.prototype.findByWorkspace.mockResolvedValue([
        { id: '1', amount: 100 },
        { id: '2', amount: 200 },
        { id: '3', amount: 300 }, // Extra for hasMore
      ]);

      const service = new TransactionService(new TransactionRepository());
      const result = await service.getTransactions('ws-1', { limit: 2 });

      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe('2');
    });
  });
});
```

### 6.2 Integration Tests (Testcontainers)

```typescript
// packages/app-services/src/__tests__/integration/transactions.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

describe('Transaction Integration', () => {
  let postgres: StartedPostgreSqlContainer;
  let redis: StartedRedisContainer;
  let prisma: PrismaClient;

  beforeAll(async () => {
    // Start containers
    [postgres, redis] = await Promise.all([
      new PostgreSqlContainer().start(),
      new RedisContainer().start(),
    ]);

    // Set env vars
    process.env.DATABASE_URL = postgres.getConnectionUri();
    process.env.UPSTASH_REDIS_REST_URL = `http://${redis.getHost()}:${redis.getPort()}`;

    // Run migrations
    execSync('pnpm prisma migrate deploy', {
      env: { ...process.env, DATABASE_URL: postgres.getConnectionUri() },
    });

    prisma = new PrismaClient();
  }, 60000);

  afterAll(async () => {
    await prisma.$disconnect();
    await postgres.stop();
    await redis.stop();
  });

  it('creates and retrieves transactions', async () => {
    // Create test data
    const workspace = await prisma.workspace.create({
      data: { name: 'Test', baseCurrency: 'USD' },
    });

    await prisma.bankTransaction.createMany({
      data: [
        { workspaceId: workspace.id, amount: 100, description: 'Test 1' },
        { workspaceId: workspace.id, amount: 200, description: 'Test 2' },
      ],
    });

    // Test service
    const { TransactionService } = await import('../../transactions/service');
    const service = new TransactionService();

    const result = await service.getTransactions(workspace.id, { limit: 10 });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].description).toBe('Test 2'); // DESC order
  });
});
```

### 6.3 Contract Tests (API DTOs)

```typescript
// apps/web/src/__tests__/contracts/transactions.test.ts
import { describe, it, expect } from 'vitest';
import { transactionDtoSchema } from '@moneio/app-services/transactions/dto';
import sampleResponse from './fixtures/transactions-response.json';

describe('Transaction API Contract', () => {
  it('response matches DTO schema', () => {
    const result = transactionDtoSchema.array().safeParse(sampleResponse.items);

    expect(result.success).toBe(true);
    if (!result.success) {
      console.error(result.error.flatten());
    }
  });

  it('handles null optional fields', () => {
    const withNulls = {
      ...sampleResponse.items[0],
      categoryId: null,
      merchantId: null,
    };

    const result = transactionDtoSchema.safeParse(withNulls);
    expect(result.success).toBe(true);
  });
});
```

### 6.4 E2E Tests (Playwright)

```typescript
// apps/web/e2e/transactions.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Transactions', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('[name="email"]', 'test@example.com');
    await page.fill('[name="password"]', 'password');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard');
  });

  test('can view and filter transactions', async ({ page }) => {
    await page.goto('/transactions');

    // Wait for data
    await expect(page.getByTestId('transaction-list')).toBeVisible();

    // Filter by uncategorized
    await page.click('[data-testid="filter-uncategorized"]');

    // Verify filter applied
    await expect(page.getByTestId('transaction-row')).toHaveCount(5);
  });

  test('can categorize a transaction', async ({ page }) => {
    await page.goto('/transactions');

    // Click on transaction
    await page.click('[data-testid="transaction-row"]:first-child');

    // Select category
    await page.click('[data-testid="category-select"]');
    await page.click('[data-testid="category-option-office"]');

    // Verify success
    await expect(page.getByText('Transaction categorized')).toBeVisible();
  });
});
```

### 6.5 CI Pipeline

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, 'feat/**', 'claude/**']
  pull_request:
    branches: [main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm format:check

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:generate
      - run: pnpm typecheck

  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:unit

  test-integration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
      redis:
        image: redis:7
        ports:
          - 6379:6379
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:generate
      - run: pnpm test:integration
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
          REDIS_URL: redis://localhost:6379

  build:
    needs: [lint, typecheck, test-unit]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm db:generate
      - run: pnpm build
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          NEXT_PUBLIC_SUPABASE_URL: ${{ vars.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ vars.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
```

---

## Part 7: AI/ML Safety & Cost Controls

### 7.1 Centralized LLM Client with Instrumentation

```typescript
// packages/ai/src/clients/index.ts
import { InstrumentedLlmClient } from '@moneio/observability';
import { createOpenAiClient } from './openai';
import { createGeminiClient } from './gemini';

export function createLlmClient(options?: LlmClientOptions): LlmClient {
  // Create base client
  let client: LlmClient;

  if (process.env.GEMINI_API_KEY) {
    client = createGeminiClient(options);
  } else if (process.env.OPENAI_API_KEY) {
    client = createOpenAiClient(options);
  } else {
    throw new Error('No LLM API key configured');
  }

  // Wrap with instrumentation
  return new InstrumentedLlmClient(client, {
    context: options?.context || 'unknown',
    workspaceId: options?.workspaceId,
    trackCost: true,
    trackTokens: true,
  });
}
```

### 7.2 Content Guardrails

```typescript
// packages/ai/src/guardrails/index.ts
import { z } from 'zod';

export interface GuardrailResult {
  safe: boolean;
  violations: string[];
}

export async function checkInputGuardrails(input: string): Promise<GuardrailResult> {
  const violations: string[] = [];

  // Check for PII patterns
  const piiPatterns = [
    /\b\d{3}-\d{2}-\d{4}\b/,  // SSN
    /\b\d{16}\b/,             // Credit card
  ];

  for (const pattern of piiPatterns) {
    if (pattern.test(input)) {
      violations.push('Input contains potential PII');
    }
  }

  // Check input length
  if (input.length > 10000) {
    violations.push('Input exceeds maximum length');
  }

  return {
    safe: violations.length === 0,
    violations,
  };
}

export function validateOutputSchema<T>(
  output: unknown,
  schema: z.ZodSchema<T>
): { valid: boolean; data?: T; errors?: string[] } {
  const result = schema.safeParse(output);

  if (result.success) {
    return { valid: true, data: result.data };
  }

  return {
    valid: false,
    errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
  };
}
```

### 7.3 Eval Suites

```typescript
// packages/ai/src/eval/extraction.ts
import { readFileSync } from 'fs';
import { InvoiceExtractor } from '../extraction/invoice-extractor';

interface EvalCase {
  id: string;
  input: string;
  expected: {
    invoiceNumber?: string;
    total?: number;
    currency?: string;
  };
}

export async function runExtractionEval(): Promise<EvalReport> {
  const cases: EvalCase[] = JSON.parse(
    readFileSync('packages/ai/src/eval/fixtures/invoices.json', 'utf-8')
  );

  const extractor = new InvoiceExtractor();
  const results: EvalResult[] = [];

  for (const testCase of cases) {
    const start = Date.now();
    const result = await extractor.extract(testCase.input);
    const duration = Date.now() - start;

    const matches = {
      invoiceNumber: result.data.invoiceNumber === testCase.expected.invoiceNumber,
      total: Math.abs((result.data.total || 0) - (testCase.expected.total || 0)) < 0.01,
      currency: result.data.currency === testCase.expected.currency,
    };

    results.push({
      caseId: testCase.id,
      passed: Object.values(matches).every(Boolean),
      matches,
      confidence: result.confidence,
      duration,
    });
  }

  return {
    total: results.length,
    passed: results.filter(r => r.passed).length,
    avgConfidence: results.reduce((sum, r) => sum + r.confidence, 0) / results.length,
    avgDuration: results.reduce((sum, r) => sum + r.duration, 0) / results.length,
    results,
  };
}
```

### 7.4 Cost Dashboards & Alerts

```typescript
// packages/observability/src/alerts/llm-cost.ts
interface CostAlert {
  type: 'daily_budget' | 'per_request' | 'anomaly';
  threshold: number;
  action: 'warn' | 'block' | 'alert';
}

const costAlerts: CostAlert[] = [
  { type: 'daily_budget', threshold: 100, action: 'alert' },     // $100/day
  { type: 'per_request', threshold: 1, action: 'block' },        // $1/request max
  { type: 'anomaly', threshold: 3, action: 'warn' },             // 3x normal
];

export async function checkCostLimits(
  workspaceId: string,
  estimatedCost: number
): Promise<{ allowed: boolean; reason?: string }> {
  // Check per-request limit
  if (estimatedCost > 1) {
    return { allowed: false, reason: 'Request cost exceeds $1 limit' };
  }

  // Check daily budget
  const dailySpend = await getDailySpend(workspaceId);
  if (dailySpend + estimatedCost > 100) {
    await alertOnCall({
      severity: 'high',
      message: `Workspace ${workspaceId} approaching daily LLM budget`,
    });
    return { allowed: false, reason: 'Daily budget exceeded' };
  }

  return { allowed: true };
}
```

---

## Part 8: Team Workflow

### 8.1 Documentation Updates

**Fix README.md:**
- Remove references to Drizzle (we use Prisma)
- Remove references to Hono (we use Next.js route handlers)
- Add architecture overview matching current stack
- Document the worker pipeline

**Fix package.json duplicates:**
```bash
# Remove duplicate ElevenLabs packages
pnpm remove @11labs/react  # Keep @elevenlabs/react
```

### 8.2 New Feature Template

```markdown
# Adding a New Workspace-Scoped Feature

## 1. Create Service Layer

```
packages/app-services/src/my-feature/
├── service.ts        # Business logic
├── repository.ts     # Database access
├── dto.ts           # API types
├── mapper.ts        # Entity ↔ DTO
└── __tests__/
    ├── service.test.ts
    └── integration.test.ts
```

## 2. Create API Route

```typescript
// apps/web/src/app/api/my-feature/route.ts
import { withApi } from '@moneio/app-services/shared';
import { getMyFeature } from '@moneio/app-services/my-feature';

export const GET = withApi(
  { rateLimit: 'api', permission: 'my-feature:read' },
  async ({ workspaceId }) => getMyFeature(workspaceId)
);
```

## 3. Create Server Component

```typescript
// apps/web/src/app/[locale]/(app)/my-feature/page.tsx
export default async function MyFeaturePage() {
  const { workspaceId } = await getTenantContext();
  const data = await getMyFeature(workspaceId);
  return <MyFeatureView data={data} />;
}
```

## 4. Add Tests

- Unit test for service logic
- Integration test with Testcontainers
- Contract test for API response
- E2E test for critical flow
```

### 8.3 Code Review Checklist

```markdown
## Architecture
- [ ] Data fetched in Server Components (not useEffect)
- [ ] Business logic in app-services, not route handlers
- [ ] Prisma access only in repository layer
- [ ] DTOs used for API responses (no Prisma models)

## Security
- [ ] Uses withApi wrapper (auth + rate limit)
- [ ] Permission check for sensitive operations
- [ ] No service-role key in client code
- [ ] Input validated with Zod

## Reliability
- [ ] Queue jobs have idempotency keys
- [ ] External calls have circuit breakers
- [ ] Errors logged with trace context
- [ ] Graceful degradation for optional features

## Performance
- [ ] Cursor pagination (not offset)
- [ ] Appropriate caching (cache() or unstable_cache)
- [ ] No N+1 queries
- [ ] Streaming with Suspense for slow data

## Testing
- [ ] Unit tests for business logic
- [ ] Integration test if touching DB
- [ ] Contract test if changing API response
```

---

## Summary: Prioritized Action Plan

| Week | Focus | Key Deliverables |
|------|-------|------------------|
| 0 | Decisions | ADR for serverless vs container, update README |
| 1-2 | Service Layer | Create app-services package, extract 3 services |
| 3 | RSC Migration | Convert dashboard + transactions to RSC |
| 4 | Infrastructure | Connection pooling, queue idempotency, DLQ |
| 5 | Auth & Rate Limits | Unified withApi wrapper, tenant quotas |
| 6-7 | Observability | OpenTelemetry in web, trace propagation |
| 8 | Caching | Redis caching, cursor pagination |
| 9-10 | Testing | Test pyramid, CI gates |
| 11-12 | AI Safety | Eval suites, cost controls, guardrails |

**Estimated effort:** 12 weeks, 2 engineers, ~500 engineering hours

---

## Appendix: File Locations

| Component | Current Location | Target Location |
|-----------|-----------------|-----------------|
| Tenant Context | N/A (scattered) | `packages/app-services/src/shared/tenant-context.ts` |
| Rate Limiting | N/A | `packages/app-services/src/shared/rate-limit.ts` |
| Transaction Service | `apps/web/src/app/api/transactions/route.ts` | `packages/app-services/src/transactions/service.ts` |
| Dashboard Data | `apps/web/src/app/[locale]/(app)/dashboard/page.tsx` | `packages/app-services/src/dashboard/service.ts` |
| Queue Idempotency | N/A | `apps/worker/src/lib/queues.ts` |
| DLQ Handler | N/A | `apps/worker/src/lib/dlq.ts` |
| Web Tracing | N/A | `apps/web/instrumentation.ts` |
| Eval Suite | N/A | `packages/ai/src/eval/` |
