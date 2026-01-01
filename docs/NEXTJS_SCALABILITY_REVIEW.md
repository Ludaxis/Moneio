# Next.js Scalability Review: Moneio

**Author**: Principal Software Engineer Review
**Date**: January 2025
**Scope**: Full codebase evaluation for scaling to thousands of users

---

## Executive Summary

Moneio is a well-architected AI-powered accounting assistant built on a solid foundation. The monorepo structure, type safety, and separation of concerns are excellent. However, several critical improvements are needed to scale reliably to thousands of concurrent users.

**Current Grade: B+**
**Target Grade: A+**

### Quick Wins (1-2 weeks)
- Add error boundaries
- Implement React Query for client state
- Add API response caching

### Medium-term (1-2 months)
- Replace offset pagination with cursors
- Add rate limiting and request deduplication
- Implement feature flags

### Long-term (2-4 months)
- Add real-time updates via WebSocket
- Implement full observability stack
- Add horizontal scaling for workers

---

## Part 1: Current State Assessment

### Strengths (What's Done Right)

#### 1. Monorepo Architecture ✅
```
apps/
  web/         # Next.js 14 frontend
  worker/      # BullMQ job processor
packages/
  core-ledger/ # Zero dependencies - foundational types
  domain/      # Business logic + Zod schemas
  ai/          # LLM adapters
  db/          # Prisma ORM
  ui/          # Radix UI components
```

**Why this is good:**
- Clear separation of concerns
- Enforced dependency rules (domain never imports UI)
- Shared types prevent drift between frontend/backend
- Turborepo provides efficient caching

#### 2. Zero-Dependency Core ✅
The `core-ledger` package has **zero external dependencies**:
```typescript
// packages/core-ledger/package.json
{
  "dependencies": {}  // Pure TypeScript types
}
```

**Why this matters:**
- No transitive dependency vulnerabilities
- Fast builds
- Types can be published as standalone npm package

#### 3. Type Safety ✅
```typescript
// Strict TypeScript everywhere
{
  "strict": true,
  "strictNullChecks": true,
  "noImplicitAny": true,
  "noUnusedLocals": true
}
```

**Combined with Zod for runtime validation:**
```typescript
const invoiceSchema = z.object({
  amount: z.number().positive(),
  currency: currencyCodeSchema,
  dueDate: z.string().datetime(),
});

// Type inferred from schema
type Invoice = z.infer<typeof invoiceSchema>;
```

#### 4. Human-in-the-Loop AI ✅
```typescript
interface AiProposal<T> {
  data: T;
  confidence: number;     // 0-100
  evidence: AiEvidence[]; // Citations with bounding boxes
  modelInfo: ModelInfo;
}
```

All AI suggestions require user approval before creating financial records. This is critical for an accounting app.

#### 5. Internationalization ✅
Full RTL support for Arabic and Persian:
```typescript
export const rtlLocales: Locale[] = ['fa', 'ar'];
export function getDirection(locale: Locale): 'ltr' | 'rtl' {
  return rtlLocales.includes(locale) ? 'rtl' : 'ltr';
}
```

#### 6. Observability Foundation ✅
Datadog LLM observability with cost tracking:
```typescript
const telemetry: LlmTelemetry = {
  provider, model, inputTokens, outputTokens,
  estimatedCost, completionTime
};
```

#### 7. Graceful Worker Shutdown ✅
```typescript
async function shutdown(signal: string) {
  await Promise.all(workers.map(w => w.close()));
  await closeQueues();
  await closeRedisConnection();
  process.exit(0);
}
```

#### 8. Upstash-Optimized Queue Settings ✅
```typescript
{
  drainDelay: 5000,        // 5s polling vs 5ms default
  stalledInterval: 300000, // 5 min stall check
}
```

Reduces Upstash API calls by ~1000x.

---

## Part 2: Critical Issues for Scale

### Issue 1: No Caching Strategy 🔴 CRITICAL

**Current state:**
```typescript
// Every API route
export const dynamic = 'force-dynamic';
```

**Impact:**
- Every request hits the database
- No CDN caching
- High latency under load

**Evidence:**
```
apps/web/src/app/api/*/route.ts - All 67+ routes have force-dynamic
```

### Issue 2: Offset Pagination Doesn't Scale 🔴 CRITICAL

**Current state:**
```typescript
skip: (page - 1) * pageSize,
take: pageSize,
```

**Impact:**
- Page 1000 requires scanning 20,000 rows
- O(n) performance degradation
- Database timeouts on large datasets

**At 10,000 transactions per workspace:**
- Page 1: ~10ms
- Page 100: ~500ms
- Page 500: Timeout

### Issue 3: No Error Boundaries 🟡 HIGH

**Current state:**
- No `error.tsx` files in app router
- Unhandled errors crash the page

**Impact:**
- Single component error breaks entire page
- Poor user experience
- No error recovery path

### Issue 4: Client State Management 🟡 HIGH

**Current state:**
```typescript
// Manual fetch with useEffect
useEffect(() => {
  fetch('/api/transactions')
    .then(res => res.json())
    .then(setData);
}, [workspaceId]);
```

**Missing:**
- Request deduplication
- Automatic revalidation
- Optimistic updates
- Cache invalidation
- Loading/error states

### Issue 5: No Rate Limiting 🟡 HIGH

**Current state:**
- No rate limiting on API routes
- No request throttling
- No abuse protection

**Impact:**
- Vulnerable to DoS
- Single user can exhaust resources
- No fair resource sharing

### Issue 6: Database Connection Pooling 🟡 HIGH

**Current state:**
```typescript
// Singleton pattern
export const prisma = global.prisma || new PrismaClient();
```

**Issues for serverless:**
- Cold starts create new connections
- Connection exhaustion under load
- No external pooler configuration

### Issue 7: Long API Routes 🟠 MEDIUM

**Current state:**
```
apps/web/src/app/api/chat/route.ts - 860 lines
apps/web/src/app/api/reports/*/route.ts - Complex SQL
```

**Impact:**
- Hard to test
- Difficult to maintain
- High cognitive load

### Issue 8: No Feature Flags 🟠 MEDIUM

**Current state:**
- No feature flag system
- Changes require deployment
- No gradual rollout

### Issue 9: No API Versioning 🟠 MEDIUM

**Current state:**
```
/api/transactions  # No version
```

**Impact:**
- Breaking changes affect all clients
- No deprecation path
- Difficult to maintain backwards compatibility

### Issue 10: No Real-time Updates 🟠 MEDIUM

**Current state:**
- Polling for document status
- Manual refresh for new data

**Impact:**
- Higher server load
- Stale data
- Poor UX for collaborative features

---

## Part 3: The Improvement Plan

### Phase 1: Foundation (Weeks 1-2)

#### 1.1 Add Error Boundaries

Create error boundaries for each route group:

```typescript
// apps/web/src/app/[locale]/(app)/error.tsx
'use client';

import { useEffect } from 'react';
import { Button } from '@moneio/ui';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="text-muted-foreground">
        {error.message || 'An unexpected error occurred'}
      </p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
```

Create for each route group:
- `apps/web/src/app/[locale]/(app)/error.tsx`
- `apps/web/src/app/[locale]/(app)/documents/error.tsx`
- `apps/web/src/app/[locale]/(app)/transactions/error.tsx`
- `apps/web/src/app/[locale]/(auth)/error.tsx`

#### 1.2 Implement React Query

```bash
pnpm add @tanstack/react-query @tanstack/react-query-devtools
```

Create query client provider:

```typescript
// apps/web/src/lib/query/provider.tsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,      // 1 minute
            gcTime: 5 * 60 * 1000,     // 5 minutes
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

Create typed query hooks:

```typescript
// apps/web/src/lib/query/hooks/use-transactions.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export const transactionKeys = {
  all: ['transactions'] as const,
  lists: () => [...transactionKeys.all, 'list'] as const,
  list: (workspaceId: string, filters: TransactionFilters) =>
    [...transactionKeys.lists(), workspaceId, filters] as const,
  details: () => [...transactionKeys.all, 'detail'] as const,
  detail: (id: string) => [...transactionKeys.details(), id] as const,
};

export function useTransactions(workspaceId: string, filters: TransactionFilters) {
  return useQuery({
    queryKey: transactionKeys.list(workspaceId, filters),
    queryFn: () => fetchTransactions(workspaceId, filters),
    enabled: !!workspaceId,
  });
}

export function useCategorizeTransaction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ transactionId, categoryId }: CategorizeInput) =>
      categorizeTransaction(transactionId, categoryId),
    onSuccess: (_, { transactionId }) => {
      // Invalidate specific transaction and list
      queryClient.invalidateQueries({
        queryKey: transactionKeys.detail(transactionId)
      });
      queryClient.invalidateQueries({
        queryKey: transactionKeys.lists()
      });
    },
  });
}
```

#### 1.3 Add Loading States

```typescript
// apps/web/src/app/[locale]/(app)/transactions/loading.tsx
import { TransactionListSkeleton } from '@/components/transactions/skeleton';

export default function Loading() {
  return <TransactionListSkeleton />;
}
```

### Phase 2: Performance (Weeks 3-4)

#### 2.1 Replace Offset with Cursor Pagination

```typescript
// packages/domain/src/schemas/common.ts
export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
  direction: z.enum(['forward', 'backward']).default('forward'),
});

// In API route
const { cursor, limit, direction } = cursorPaginationSchema.parse(params);

const transactions = await prisma.bankTransaction.findMany({
  where: {
    workspaceId,
    ...(cursor && {
      id: direction === 'forward' ? { lt: cursor } : { gt: cursor },
    }),
  },
  orderBy: { id: 'desc' },
  take: limit + 1, // Fetch one extra to check hasMore
});

const hasMore = transactions.length > limit;
const items = hasMore ? transactions.slice(0, -1) : transactions;
const nextCursor = hasMore ? items[items.length - 1].id : null;

return {
  items,
  nextCursor,
  hasMore,
};
```

#### 2.2 Add Response Caching

```typescript
// apps/web/src/lib/api/cache.ts
import { unstable_cache } from 'next/cache';

export const getCachedCategories = unstable_cache(
  async (workspaceId: string) => {
    return prisma.category.findMany({
      where: { workspaceId },
      orderBy: { name: 'asc' },
    });
  },
  ['categories'],
  {
    revalidate: 60 * 5, // 5 minutes
    tags: ['categories'],
  }
);

// Invalidate on mutation
import { revalidateTag } from 'next/cache';

export async function createCategory(data: CategoryInput) {
  const category = await prisma.category.create({ data });
  revalidateTag('categories');
  return category;
}
```

#### 2.3 Add HTTP Caching Headers

```typescript
// For read-only endpoints that don't change often
export async function GET(request: Request) {
  const data = await getCachedCategories(workspaceId);

  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
    },
  });
}
```

#### 2.4 Database Connection Pooling

Add PgBouncer or Supabase connection pooling:

```env
# Direct connection for migrations
DIRECT_URL="postgresql://user:pass@host:5432/db"

# Pooled connection for runtime (Supabase Pooler)
DATABASE_URL="postgresql://user:pass@host:6543/db?pgbouncer=true"
```

Update Prisma schema:
```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

### Phase 3: Reliability (Weeks 5-6)

#### 3.1 Add Rate Limiting

```bash
pnpm add @upstash/ratelimit @upstash/redis
```

```typescript
// apps/web/src/lib/api/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

// Different limits for different operations
export const rateLimiters = {
  // Standard API: 100 requests per minute
  api: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, '1m'),
    prefix: 'ratelimit:api',
  }),

  // AI operations: 20 per minute (expensive)
  ai: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, '1m'),
    prefix: 'ratelimit:ai',
  }),

  // Document uploads: 10 per minute
  upload: new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, '1m'),
    prefix: 'ratelimit:upload',
  }),
};

export async function checkRateLimit(
  limiter: Ratelimit,
  identifier: string
): Promise<{ success: boolean; reset: number }> {
  const { success, reset } = await limiter.limit(identifier);
  return { success, reset };
}
```

```typescript
// apps/web/src/lib/api/with-rate-limit.ts
import { rateLimiters } from './rate-limit';

export function withRateLimit(
  limiterKey: keyof typeof rateLimiters,
  handler: AuthenticatedHandler
) {
  return async (request: Request, context: AuthContext) => {
    const limiter = rateLimiters[limiterKey];
    const { success, reset } = await checkRateLimit(limiter, context.user.id);

    if (!success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfter: reset },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((reset - Date.now()) / 1000)),
            'X-RateLimit-Reset': String(reset),
          },
        }
      );
    }

    return handler(request, context);
  };
}
```

#### 3.2 Add Request Validation Middleware

```typescript
// apps/web/src/lib/api/with-validation.ts
import { z, ZodSchema } from 'zod';

interface ValidationOptions<T> {
  body?: ZodSchema<T>;
  query?: ZodSchema<T>;
  params?: ZodSchema<T>;
}

export function withValidation<TBody, TQuery, TParams>(
  options: ValidationOptions<TBody | TQuery | TParams>,
  handler: (
    request: Request,
    context: {
      body: TBody;
      query: TQuery;
      params: TParams;
    }
  ) => Promise<Response>
) {
  return async (request: Request, routeContext?: { params?: Promise<TParams> }) => {
    const errors: Record<string, unknown> = {};
    let body: TBody = {} as TBody;
    let query: TQuery = {} as TQuery;
    let params: TParams = {} as TParams;

    // Validate body
    if (options.body) {
      try {
        const json = await request.json();
        const result = options.body.safeParse(json);
        if (!result.success) {
          errors.body = result.error.flatten();
        } else {
          body = result.data as TBody;
        }
      } catch {
        errors.body = 'Invalid JSON';
      }
    }

    // Validate query params
    if (options.query) {
      const url = new URL(request.url);
      const queryObj = Object.fromEntries(url.searchParams);
      const result = options.query.safeParse(queryObj);
      if (!result.success) {
        errors.query = result.error.flatten();
      } else {
        query = result.data as TQuery;
      }
    }

    // Validate route params
    if (options.params && routeContext?.params) {
      const resolvedParams = await routeContext.params;
      const result = options.params.safeParse(resolvedParams);
      if (!result.success) {
        errors.params = result.error.flatten();
      } else {
        params = result.data as TParams;
      }
    }

    if (Object.keys(errors).length > 0) {
      return NextResponse.json(
        { error: 'Validation failed', details: errors },
        { status: 400 }
      );
    }

    return handler(request, { body, query, params });
  };
}
```

#### 3.3 Add Circuit Breaker for External Services

```typescript
// packages/utils/src/circuit-breaker.ts
export interface CircuitBreakerOptions {
  failureThreshold: number;     // Failures before opening
  successThreshold: number;     // Successes before closing
  timeout: number;              // Time in open state before half-open
}

export class CircuitBreaker {
  private failures = 0;
  private successes = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private nextAttempt = 0;

  constructor(private options: CircuitBreakerOptions) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is open');
      }
      this.state = 'half-open';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.options.successThreshold) {
        this.state = 'closed';
        this.successes = 0;
      }
    }
  }

  private onFailure() {
    this.failures++;
    this.successes = 0;
    if (this.failures >= this.options.failureThreshold) {
      this.state = 'open';
      this.nextAttempt = Date.now() + this.options.timeout;
    }
  }

  getState() {
    return this.state;
  }
}
```

Usage in AI package:
```typescript
// packages/ai/src/clients/openai.ts
const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000, // 30 seconds
});

export async function complete(prompt: string): Promise<string> {
  return circuitBreaker.execute(async () => {
    return client.chat.completions.create({ /* ... */ });
  });
}
```

### Phase 4: Developer Experience (Weeks 7-8)

#### 4.1 Add Feature Flags

```bash
pnpm add @vercel/flags
```

```typescript
// apps/web/src/lib/flags/index.ts
import { flag } from '@vercel/flags/next';

export const showNewDashboard = flag({
  key: 'new-dashboard',
  decide: async () => {
    // Could be based on user, workspace, or percentage
    return false;
  },
});

export const enableVoiceCommands = flag({
  key: 'voice-commands',
  decide: async ({ headers }) => {
    // Enable for internal team only
    const email = headers.get('x-user-email');
    return email?.endsWith('@moneio.com') ?? false;
  },
});
```

```typescript
// Usage in component
import { showNewDashboard } from '@/lib/flags';

export default async function DashboardPage() {
  const useNewDashboard = await showNewDashboard();

  if (useNewDashboard) {
    return <NewDashboard />;
  }

  return <LegacyDashboard />;
}
```

#### 4.2 Add API Versioning

```typescript
// apps/web/src/app/api/v1/transactions/route.ts
export { GET, POST } from '@/lib/api/v1/transactions';

// apps/web/src/app/api/v2/transactions/route.ts
export { GET, POST } from '@/lib/api/v2/transactions';
```

Create version router:
```typescript
// apps/web/src/lib/api/version.ts
export function getApiVersion(request: Request): 'v1' | 'v2' {
  const header = request.headers.get('X-API-Version');
  if (header === 'v2') return 'v2';

  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/v2/')) return 'v2';

  return 'v1'; // Default
}
```

#### 4.3 Refactor Long API Routes

Split the 860-line chat route:

```
apps/web/src/app/api/chat/
├── route.ts              # Entry point (50 lines)
├── handlers/
│   ├── spending.ts       # Spending queries
│   ├── forecasting.ts    # Financial forecasting
│   ├── categorization.ts # Category suggestions
│   └── general.ts        # General queries
├── parsers/
│   ├── intent.ts         # Intent detection
│   └── entities.ts       # Entity extraction
└── providers/
    └── financial-data.ts # Data provider
```

```typescript
// apps/web/src/app/api/chat/route.ts
import { detectIntent } from './parsers/intent';
import { handlers } from './handlers';

export async function POST(request: Request) {
  const { message, workspaceId } = await request.json();

  const intent = await detectIntent(message);
  const handler = handlers[intent.type];

  if (!handler) {
    return handlers.general(message, workspaceId);
  }

  return handler(intent, workspaceId);
}
```

#### 4.4 Add Integration Tests

```typescript
// apps/web/src/__tests__/api/transactions.test.ts
import { createMocks } from 'node-mocks-http';
import { GET, POST } from '@/app/api/transactions/route';
import { prisma } from '@moneio/db';
import { createTestUser, createTestWorkspace } from '../helpers';

describe('/api/transactions', () => {
  let user: User;
  let workspace: Workspace;

  beforeAll(async () => {
    user = await createTestUser();
    workspace = await createTestWorkspace(user.id);
  });

  afterAll(async () => {
    await prisma.workspace.delete({ where: { id: workspace.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });

  describe('GET', () => {
    it('returns paginated transactions', async () => {
      const { req } = createMocks({
        method: 'GET',
        url: `/api/transactions?workspaceId=${workspace.id}&page=1&pageSize=10`,
      });

      const response = await GET(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toHaveProperty('items');
      expect(data).toHaveProperty('total');
    });

    it('returns 401 without auth', async () => {
      // ...
    });
  });
});
```

### Phase 5: Real-time & Scale (Weeks 9-12)

#### 5.1 Add WebSocket for Real-time Updates

```bash
pnpm add pusher pusher-js
```

```typescript
// apps/web/src/lib/realtime/pusher.ts
import Pusher from 'pusher';
import PusherClient from 'pusher-js';

// Server-side
export const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true,
});

// Broadcast events
export async function broadcastDocumentStatus(
  workspaceId: string,
  documentId: string,
  status: DocumentStatus
) {
  await pusher.trigger(`workspace-${workspaceId}`, 'document-status', {
    documentId,
    status,
    timestamp: new Date().toISOString(),
  });
}
```

```typescript
// apps/web/src/hooks/use-realtime.ts
'use client';

import { useEffect } from 'react';
import PusherClient from 'pusher-js';
import { useQueryClient } from '@tanstack/react-query';

export function useRealtimeDocuments(workspaceId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const pusher = new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER!,
    });

    const channel = pusher.subscribe(`workspace-${workspaceId}`);

    channel.bind('document-status', (data: DocumentStatusEvent) => {
      queryClient.invalidateQueries({
        queryKey: ['documents', data.documentId],
      });
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(`workspace-${workspaceId}`);
    };
  }, [workspaceId, queryClient]);
}
```

#### 5.2 Add Horizontal Worker Scaling

```typescript
// apps/worker/src/lib/worker-pool.ts
import { Worker } from 'bullmq';
import os from 'os';

const numCPUs = os.cpus().length;

export function createWorkerPool(
  queueName: string,
  handler: (job: Job) => Promise<unknown>,
  options: WorkerOptions
): Worker[] {
  const poolSize = Math.min(options.concurrency || 1, numCPUs);

  return Array.from({ length: poolSize }, (_, i) =>
    new Worker(queueName, handler, {
      ...options,
      name: `${queueName}-worker-${i}`,
    })
  );
}
```

Kubernetes deployment for auto-scaling:
```yaml
# infra/k8s/worker-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: moneio-worker
spec:
  replicas: 2
  selector:
    matchLabels:
      app: moneio-worker
  template:
    spec:
      containers:
        - name: worker
          image: moneio/worker:latest
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: moneio-worker-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: moneio-worker
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: External
      external:
        metric:
          name: bullmq_queue_depth
        target:
          type: AverageValue
          averageValue: 100
```

#### 5.3 Add Full Observability Stack

```typescript
// packages/observability/src/tracing/index.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

export function initTracing(serviceName: string) {
  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: process.env.npm_package_version,
    }),
    traceExporter: new OTLPTraceExporter({
      url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();

  process.on('SIGTERM', () => {
    sdk.shutdown()
      .then(() => console.log('Tracing terminated'))
      .catch((error) => console.error('Error terminating tracing', error))
      .finally(() => process.exit(0));
  });
}
```

---

## Part 4: Architecture Diagram (Target State)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CDN (Vercel Edge)                               │
│                    Static assets, API caching, Rate limiting                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Next.js App (apps/web)                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │   Pages/     │  │     API      │  │   Server     │  │   Client     │     │
│  │   Layouts    │  │   Routes     │  │   Actions    │  │ Components   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘     │
│         │                  │                  │                  │           │
│         └──────────────────┴──────────────────┴──────────────────┘           │
│                                    │                                         │
│  ┌───────────────┐  ┌─────────────┴─────────────┐  ┌───────────────┐        │
│  │ React Query   │  │     Service Layer         │  │    Pusher     │        │
│  │ (Client)      │  │  (packages/domain)        │  │   (Realtime)  │        │
│  └───────────────┘  └───────────────────────────┘  └───────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
           ┌────────────────────────────┼────────────────────────────┐
           │                            │                            │
           ▼                            ▼                            ▼
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│   PostgreSQL     │        │      Redis       │        │    BullMQ        │
│   (Supabase)     │        │   (Upstash)      │        │    Queues        │
│  ┌────────────┐  │        │  ┌────────────┐  │        │  ┌────────────┐  │
│  │ PgBouncer  │  │        │  │ Rate Limit │  │        │  │ 9 Queues   │  │
│  │  Pooler    │  │        │  │   Cache    │  │        │  │            │  │
│  └────────────┘  │        │  └────────────┘  │        │  └────────────┘  │
└──────────────────┘        └──────────────────┘        └────────┬─────────┘
                                                                  │
                                                                  ▼
                                                   ┌──────────────────────────┐
                                                   │   Workers (apps/worker)   │
                                                   │  ┌──────┐ ┌──────┐       │
                                                   │  │ Pod 1│ │ Pod 2│ ...   │
                                                   │  └──────┘ └──────┘       │
                                                   │     Auto-scaling (K8s)    │
                                                   └──────────────────────────┘
                                                                  │
                            ┌─────────────────────────────────────┼─────────────────────────────────────┐
                            │                                     │                                     │
                            ▼                                     ▼                                     ▼
                 ┌──────────────────┐                  ┌──────────────────┐                  ┌──────────────────┐
                 │   Google Vision  │                  │   OpenAI/Gemini  │                  │   Supabase       │
                 │      (OCR)       │                  │      (LLM)       │                  │   Storage        │
                 │  Circuit Breaker │                  │  Circuit Breaker │                  │                  │
                 └──────────────────┘                  └──────────────────┘                  └──────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          Observability Layer                                 │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐                 │
│  │    Datadog     │  │  OpenTelemetry │  │    Alerts      │                 │
│  │  LLM Metrics   │  │    Tracing     │  │  (Slack/PD)    │                 │
│  └────────────────┘  └────────────────┘  └────────────────┘                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part 5: Priority Matrix

| Issue | Impact | Effort | Priority | Phase |
|-------|--------|--------|----------|-------|
| Add Error Boundaries | High | Low | P0 | 1 |
| Implement React Query | High | Medium | P0 | 1 |
| Add Rate Limiting | High | Low | P0 | 3 |
| Cursor Pagination | High | Medium | P1 | 2 |
| Response Caching | Medium | Low | P1 | 2 |
| Connection Pooling | High | Low | P1 | 2 |
| Circuit Breaker | Medium | Medium | P1 | 3 |
| Feature Flags | Medium | Medium | P2 | 4 |
| API Versioning | Medium | Medium | P2 | 4 |
| Refactor Long Routes | Medium | High | P2 | 4 |
| WebSocket Updates | Low | High | P3 | 5 |
| Worker Auto-scaling | Low | High | P3 | 5 |
| Full Observability | Low | High | P3 | 5 |

---

## Part 6: Team Workflow Improvements

### 6.1 Pull Request Template

```markdown
<!-- .github/pull_request_template.md -->
## Summary
<!-- What does this PR do? -->

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed

## Checklist
- [ ] TypeScript types are complete
- [ ] Zod schemas validate all inputs
- [ ] Error boundaries handle failures
- [ ] Loading states implemented
- [ ] Accessibility checked

## Screenshots
<!-- If applicable -->
```

### 6.2 Commit Convention

```bash
# .commitlintrc.json
{
  "extends": ["@commitlint/config-conventional"],
  "rules": {
    "scope-enum": [2, "always", [
      "web", "worker", "core-ledger", "domain",
      "ai", "db", "ui", "i18n", "utils"
    ]]
  }
}
```

Examples:
- `feat(web): add transaction filtering`
- `fix(ai): handle rate limit errors`
- `perf(db): add index for workspace queries`

### 6.3 Code Review Checklist

```markdown
## Performance
- [ ] No N+1 queries
- [ ] Proper pagination
- [ ] Caching where appropriate

## Security
- [ ] Input validation with Zod
- [ ] Authorization checks
- [ ] No sensitive data in logs

## Reliability
- [ ] Error handling complete
- [ ] Retry logic for external calls
- [ ] Graceful degradation

## Maintainability
- [ ] Types are explicit (no `any`)
- [ ] Functions under 50 lines
- [ ] Single responsibility
```

---

## Conclusion

Moneio has a solid foundation with excellent architecture choices. The main gaps are:

1. **Performance**: Caching and pagination need improvement
2. **Reliability**: Rate limiting and circuit breakers needed
3. **Developer Experience**: Feature flags and better testing

Following this plan will transform Moneio from a well-built MVP to a production-ready platform capable of handling thousands of concurrent users reliably.

**Estimated timeline**: 12 weeks with 2 engineers
**Estimated effort**: ~480 engineering hours

The investment is worthwhile - these improvements will reduce incident frequency, improve developer velocity, and create a foundation for the next 10x of growth.
