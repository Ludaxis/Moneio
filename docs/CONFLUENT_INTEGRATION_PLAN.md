# Confluent Integration & Smart Import/Categorization Plan

## Executive Summary

This plan introduces Confluent Kafka for real-time data streaming while fixing critical issues in CSV import and transaction categorization. The implementation follows Moneio's architecture principles: **modular, low dependency, no hardcoding**.

---

## Current Issues Identified

### CSV Import Problems

1. **No turnover/summary row detection** - "Opening Balance", "TOTAL", "Closing Balance" rows imported as transactions
2. **No separate debit/credit column handling** - Can't process banks that use two amount columns
3. **Hard-coded bank formats** - No configuration, patterns buried in code
4. **Date fallback to now()** - Silently corrupts transaction dates on parse failure
5. **Weak header detection** - Falls through layers but no learning from corrections

### Categorization Problems

1. **Rules engine exists but NEVER applied** - Users create rules with no effect
2. **OpenAI disabled** - Commented out, only Gemini works
3. **Sequential processing** - No parallelization, slow for large imports
4. **Hard-coded merchant patterns** - No user customization
5. **Inconsistent confidence scoring** - AI returns 50-95, Heuristic returns 40-75

---

## Architecture Principles

```
┌─────────────────────────────────────────────────────────────────┐
│                     DESIGN PRINCIPLES                           │
├─────────────────────────────────────────────────────────────────┤
│ 1. MODULAR: New packages don't touch existing code             │
│ 2. LOW DEPENDENCY: Confluent is optional, graceful fallback    │
│ 3. NO HARDCODING: All patterns/formats in config or database   │
│ 4. MERGE-SAFE: New files only, minimal edits to existing       │
│ 5. FEATURE FLAGS: Toggle Confluent on/off via environment      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation - Smart CSV Import (No Confluent Yet)

### 1.1 Create Bank Format Registry

**New File:** `packages/domain/src/csv/bank-formats.ts`

```typescript
export interface BankFormat {
  id: string;
  name: string;
  country?: string;
  headerPatterns: HeaderPattern[];
  amountConfig: {
    type: 'single' | 'split'; // split = separate debit/credit columns
    debitPattern?: string;
    creditPattern?: string;
    signConvention?: 'negative-debit' | 'positive-debit';
  };
  dateFormat: string; // e.g., 'DD.MM.YYYY', 'YYYY-MM-DD'
  excludePatterns: string[]; // Patterns to filter out (turnover rows)
  encoding?: string;
}

export interface HeaderPattern {
  field: 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'balance' | 'reference';
  patterns: string[]; // Regex patterns
  priority: number;
}
```

**New File:** `packages/domain/src/csv/bank-formats-registry.ts`

- Load formats from JSON config file
- Provide `detectBankFormat(headers: string[]): BankFormat | null`
- Provide `getBankFormat(id: string): BankFormat`

**New File:** `packages/domain/config/bank-formats.json`

- Pre-configured formats for: Wise, SEB, Swedbank, LHV, Deutsche Bank, etc.
- User can add custom formats via API

### 1.2 Smart Row Filtering

**New File:** `packages/domain/src/csv/row-filter.ts`

```typescript
export interface RowFilterConfig {
  excludePatterns: RegExp[]; // Description patterns to exclude
  excludeIfMissingAmount: boolean;
  excludeIfZeroAmount: boolean;
  turnoverKeywords: string[]; // "Opening", "Closing", "Total", "Balance"
  summaryRowDetection: boolean; // Detect rows that sum previous rows
}

export function createRowFilter(config: RowFilterConfig): RowFilter;
export function isExcludedRow(
  row: CsvRow,
  filter: RowFilter
): { excluded: boolean; reason?: string };
```

**Default Exclusion Patterns:**

```typescript
const DEFAULT_TURNOVER_KEYWORDS = [
  'opening balance',
  'closing balance',
  'начальный баланс',
  'total',
  'subtotal',
  'sum',
  'итого',
  'balance forward',
  'carried forward',
  'turnover',
  'оборот',
  'period start',
  'period end',
  'statement total',
  'account summary',
];
```

### 1.3 Split Amount Column Handler

**New File:** `packages/domain/src/csv/amount-parser.ts`

```typescript
export interface AmountParserConfig {
  type: 'single' | 'split';
  singleColumn?: string;
  debitColumn?: string;
  creditColumn?: string;
  signConvention: 'negative-debit' | 'positive-debit' | 'absolute';
  decimalSeparator?: '.' | ',' | 'auto';
  thousandsSeparator?: ',' | '.' | ' ' | 'auto';
}

export function parseAmount(row: CsvRow, config: AmountParserConfig): number | null;
```

### 1.4 Enhanced Date Parser

**Update:** `packages/core-ledger/src/utils/csv.ts`

```typescript
// Add: Return null instead of now() on parse failure
export function parseCsvDate(value: string, format?: string): Date | null {
  // ... parsing logic ...
  if (!parsed) return null; // DON'T default to now()
  return parsed;
}
```

---

## Phase 2: AI-Powered Import Intelligence

### 2.1 Confluent Package (Optional Dependency)

**New Package:** `packages/streaming/`

```
packages/streaming/
├── package.json
├── src/
│   ├── index.ts
│   ├── client.ts           # Confluent/Kafka client wrapper
│   ├── producer.ts         # Event producer
│   ├── consumer.ts         # Event consumer base
│   ├── topics.ts           # Topic definitions
│   ├── schemas/            # Avro/JSON schemas
│   │   ├── transaction.ts
│   │   ├── document.ts
│   │   └── categorization.ts
│   └── adapters/
│       ├── confluent.ts    # Confluent Cloud adapter
│       └── memory.ts       # In-memory adapter (testing/fallback)
└── tsconfig.json
```

**Key Design: Optional Streaming**

```typescript
// packages/streaming/src/client.ts
export function createStreamingClient(): StreamingClient {
  if (process.env.CONFLUENT_BOOTSTRAP_SERVERS) {
    return new ConfluentClient(config);
  }
  // Fallback: in-memory event bus (existing behavior)
  return new MemoryStreamingClient();
}
```

### 2.2 Transaction Stream Topics

```typescript
// packages/streaming/src/topics.ts
export const TOPICS = {
  // CSV Import Pipeline
  CSV_UPLOADED: 'moneio.csv.uploaded',
  CSV_PARSED: 'moneio.csv.parsed',
  CSV_ROWS_EXTRACTED: 'moneio.csv.rows',

  // Transaction Pipeline
  TRANSACTIONS_IMPORTED: 'moneio.transactions.imported',
  TRANSACTIONS_CATEGORIZATION_REQUESTED: 'moneio.transactions.categorization.requested',
  TRANSACTIONS_CATEGORIZED: 'moneio.transactions.categorized',

  // AI Events
  AI_SUGGESTION_CREATED: 'moneio.ai.suggestion.created',
  AI_SUGGESTION_APPROVED: 'moneio.ai.suggestion.approved',

  // Alerts
  ANOMALY_DETECTED: 'moneio.alerts.anomaly',
} as const;
```

### 2.3 AI Row Analyzer

**New File:** `packages/ai/src/csv/row-analyzer.ts`

```typescript
export interface RowAnalysis {
  isTransaction: boolean;
  confidence: number;
  reason: string;
  suggestedCategory?: string;
  flags: {
    isTurnover: boolean;
    isDuplicate: boolean;
    isRefund: boolean;
    isFee: boolean;
  };
}

export class AiRowAnalyzer {
  constructor(private llmClient: LlmClient) {}

  async analyzeRow(
    row: Record<string, string>,
    context: {
      previousRows: Record<string, string>[];
      bankFormat?: BankFormat;
      workspaceCategories: Category[];
    }
  ): Promise<RowAnalysis>;

  async analyzeBatch(
    rows: Record<string, string>[],
    context: AnalysisContext
  ): Promise<RowAnalysis[]>;
}
```

### 2.4 Smart Header Detection with Learning

**New File:** `packages/ai/src/csv/header-learner.ts`

```typescript
export interface HeaderMapping {
  originalHeader: string;
  normalizedField: NormalizedField;
  confidence: number;
  source: 'ai' | 'pattern' | 'user-corrected';
}

export class HeaderLearner {
  // Store user corrections to improve future detection
  async recordCorrection(
    workspaceId: string,
    original: HeaderMapping[],
    corrected: HeaderMapping[]
  ): Promise<void>;

  // Use historical corrections for this workspace
  async detectWithLearning(
    workspaceId: string,
    headers: string[],
    sampleRows: string[][]
  ): Promise<HeaderMapping[]>;
}
```

**Database Addition:**

```prisma
model HeaderMappingHistory {
  id            String   @id @default(cuid())
  workspaceId   String
  originalHeader String
  normalizedField String
  correctionCount Int @default(0)
  lastUsed      DateTime @default(now())

  @@unique([workspaceId, originalHeader])
}
```

---

## Phase 3: Enhanced Categorization

### 3.1 Apply Rules Engine (Currently Unused!)

**Edit:** `apps/worker/src/handlers/categorization.ts`

```typescript
// ADD: Apply rules FIRST, then AI for uncategorized
import { RulesEngine, findMatchingRule } from '@moneio/domain/categorization';

async function handleCategorization(job: Job<CategorizationJobData>) {
  const transactions = await fetchTransactions(job.data);
  const rules = await fetchActiveRules(job.data.workspaceId);
  const categories = await fetchCategories(job.data.workspaceId);

  for (const tx of transactions) {
    // Step 1: Try rules first (fast, deterministic)
    const matchedRule = findMatchingRule(tx, rules);
    if (matchedRule) {
      await createCategorization(tx, matchedRule.categoryId, 'rule', 100);
      continue;
    }

    // Step 2: Try AI if no rule matches
    const aiSuggestion = await categorizer.categorizeTransaction(tx, categories);
    await createAiSuggestion(tx, aiSuggestion);
  }
}
```

### 3.2 Per-Row AI Categorization During Import

**New File:** `packages/ai/src/categorization/stream-categorizer.ts`

```typescript
export class StreamCategorizer {
  constructor(
    private llmClient: LlmClient,
    private rulesEngine: RulesEngine
  ) {}

  async categorizeRow(
    row: ParsedTransaction,
    context: {
      categories: Category[];
      rules: Rule[];
      recentTransactions?: ParsedTransaction[]; // For pattern detection
    }
  ): Promise<CategorySuggestion> {
    // 1. Try rules first
    const ruleMatch = this.rulesEngine.findMatch(row);
    if (ruleMatch) {
      return { categoryId: ruleMatch.categoryId, confidence: 100, source: 'rule' };
    }

    // 2. Try heuristic patterns
    const heuristicMatch = this.heuristicMatch(row);
    if (heuristicMatch.confidence > 70) {
      return heuristicMatch;
    }

    // 3. Use AI for uncertain cases
    return this.aiCategorize(row, context);
  }
}
```

### 3.3 Configurable Merchant Patterns

**New File:** `packages/domain/src/categorization/merchant-patterns.ts`

```typescript
export interface MerchantPattern {
  id: string;
  pattern: string; // Regex pattern
  categoryId: string;
  priority: number;
  isBuiltIn: boolean; // false = user-defined
  workspaceId?: string; // null = global
}

// Load from database, not hardcoded
export async function loadMerchantPatterns(workspaceId: string): Promise<MerchantPattern[]>;
```

**Database Addition:**

```prisma
model MerchantPattern {
  id          String   @id @default(cuid())
  workspaceId String?  // null = global/built-in
  pattern     String
  categoryId  String
  priority    Int      @default(0)
  isBuiltIn   Boolean  @default(false)
  createdAt   DateTime @default(now())

  category    Category @relation(fields: [categoryId], references: [id])
  workspace   Workspace? @relation(fields: [workspaceId], references: [id])

  @@index([workspaceId])
}
```

### 3.4 Fix OpenAI Client

**Edit:** `packages/ai/src/clients/index.ts`

```typescript
// Uncomment and fix OpenAI support
import { OpenAiClient } from './openai';
import { GeminiClient } from './gemini';

export function createLlmClient(): LlmClient {
  // Priority: Gemini > OpenAI (configurable)
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY) {
    return new GeminiClient();
  }
  if (process.env.OPENAI_API_KEY) {
    return new OpenAiClient();
  }
  throw new Error('No LLM API key configured');
}
```

---

## Phase 4: Real-Time Streaming with Confluent

### 4.1 Event-Driven Import Pipeline

```
┌──────────────┐     ┌─────────────────────────────────────────────────────┐
│  CSV Upload  │────▶│              Confluent Cloud                        │
└──────────────┘     │  ┌─────────────────────────────────────────────────┐│
                     │  │  Topic: csv.rows                                ││
                     │  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐       ││
                     │  │  │Row 1│ │Row 2│ │Row 3│ │Row 4│ │Row 5│ ...   ││
                     │  │  └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘       ││
                     │  └─────┼──────┼──────┼──────┼──────┼───────────────┘│
                     └────────┼──────┼──────┼──────┼──────┼────────────────┘
                              │      │      │      │      │
                              ▼      ▼      ▼      ▼      ▼
                     ┌────────────────────────────────────────────┐
                     │         AI Consumer Group                  │
                     │  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
                     │  │ Worker 1 │  │ Worker 2 │  │ Worker 3 │ │
                     │  │(Gemini)  │  │(Gemini)  │  │(Gemini)  │ │
                     │  └────┬─────┘  └────┬─────┘  └────┬─────┘ │
                     └───────┼─────────────┼─────────────┼───────┘
                             │             │             │
                             ▼             ▼             ▼
                     ┌─────────────────────────────────────────────┐
                     │  Topic: transactions.categorized            │
                     └─────────────────────────────────────────────┘
                                          │
                                          ▼
                     ┌─────────────────────────────────────────────┐
                     │  WebSocket Gateway → Real-time UI Updates   │
                     └─────────────────────────────────────────────┘
```

### 4.2 Streaming Consumer Implementation

**New File:** `apps/worker/src/consumers/transaction-categorizer.ts`

```typescript
import { KafkaConsumer } from '@moneio/streaming';
import { StreamCategorizer } from '@moneio/ai/categorization';

export class TransactionCategorizerConsumer extends KafkaConsumer {
  topic = TOPICS.CSV_ROWS_EXTRACTED;
  groupId = 'transaction-categorizer';

  async handleMessage(message: TransactionRowMessage) {
    const { row, workspaceId, importId } = message;

    // Load workspace context (cached)
    const context = await this.loadContext(workspaceId);

    // Analyze row (is it a transaction or turnover?)
    const analysis = await this.rowAnalyzer.analyzeRow(row, context);

    if (!analysis.isTransaction) {
      await this.producer.send(TOPICS.CSV_ROW_SKIPPED, {
        importId,
        row,
        reason: analysis.reason,
      });
      return;
    }

    // Categorize
    const suggestion = await this.categorizer.categorizeRow(row, context);

    // Emit categorized transaction
    await this.producer.send(TOPICS.TRANSACTIONS_CATEGORIZED, {
      importId,
      transaction: row,
      category: suggestion,
      analysis,
    });
  }
}
```

### 4.3 Real-Time Progress Updates

**New File:** `apps/web/src/lib/streaming/import-progress.ts`

```typescript
export function useImportProgress(importId: string) {
  const [progress, setProgress] = useState<ImportProgress>({
    total: 0,
    processed: 0,
    categorized: 0,
    skipped: 0,
    errors: 0,
  });

  useEffect(() => {
    // Connect to WebSocket for real-time updates
    const ws = new WebSocket(`${WS_URL}/imports/${importId}`);

    ws.onmessage = (event) => {
      const update = JSON.parse(event.data);
      setProgress((prev) => ({
        ...prev,
        ...update,
      }));
    };

    return () => ws.close();
  }, [importId]);

  return progress;
}
```

---

## Phase 5: Anomaly Detection & Alerts

### 5.1 Stream Processing for Anomalies

**New File:** `packages/ai/src/anomaly/detector.ts`

```typescript
export interface AnomalyConfig {
  spendingThreshold: number; // Alert if spending > X% above average
  duplicateWindow: number; // Days to check for duplicates
  unusualMerchantThreshold: number;
}

export class AnomalyDetector {
  async detectAnomalies(transaction: Transaction, history: TransactionHistory): Promise<Anomaly[]> {
    const anomalies: Anomaly[] = [];

    // Duplicate detection
    const duplicate = await this.findDuplicate(transaction, history);
    if (duplicate) {
      anomalies.push({
        type: 'duplicate',
        severity: 'high',
        message: `Possible duplicate of transaction from ${duplicate.date}`,
        evidence: duplicate,
      });
    }

    // Spending spike
    const avgSpending = await this.getAverageSpending(transaction.categoryId);
    if (transaction.amount > avgSpending * this.config.spendingThreshold) {
      anomalies.push({
        type: 'spending_spike',
        severity: 'medium',
        message: `${Math.round((transaction.amount / avgSpending - 1) * 100)}% above average`,
      });
    }

    return anomalies;
  }
}
```

---

## File Changes Summary

### New Files (No Conflicts)

| Package     | File                                       | Purpose                     |
| ----------- | ------------------------------------------ | --------------------------- |
| `domain`    | `src/csv/bank-formats.ts`                  | Bank format types           |
| `domain`    | `src/csv/bank-formats-registry.ts`         | Format detection            |
| `domain`    | `src/csv/row-filter.ts`                    | Turnover row filtering      |
| `domain`    | `src/csv/amount-parser.ts`                 | Split debit/credit handling |
| `domain`    | `src/categorization/merchant-patterns.ts`  | Configurable patterns       |
| `domain`    | `config/bank-formats.json`                 | Pre-configured formats      |
| `ai`        | `src/csv/row-analyzer.ts`                  | AI row analysis             |
| `ai`        | `src/csv/header-learner.ts`                | Learning from corrections   |
| `ai`        | `src/categorization/stream-categorizer.ts` | Per-row categorization      |
| `ai`        | `src/anomaly/detector.ts`                  | Anomaly detection           |
| `streaming` | `*` (new package)                          | Confluent integration       |
| `worker`    | `src/consumers/*.ts`                       | Kafka consumers             |
| `db`        | `prisma/migrations/*`                      | New tables                  |

### Minimal Edits (Low Conflict Risk)

| File                                         | Change                                             |
| -------------------------------------------- | -------------------------------------------------- |
| `packages/core-ledger/src/utils/csv.ts`      | Return `null` instead of `now()` for invalid dates |
| `packages/ai/src/clients/index.ts`           | Uncomment OpenAI, add provider selection           |
| `apps/worker/src/handlers/categorization.ts` | Add rules engine call before AI                    |
| `apps/worker/src/index.ts`                   | Add Kafka consumer initialization (optional)       |
| `packages/db/prisma/schema.prisma`           | Add new models                                     |

---

## Environment Variables

```bash
# Confluent Cloud (Optional - graceful fallback to BullMQ)
CONFLUENT_BOOTSTRAP_SERVERS=pkc-xxx.region.aws.confluent.cloud:9092
CONFLUENT_API_KEY=your-api-key
CONFLUENT_API_SECRET=your-api-secret
CONFLUENT_SCHEMA_REGISTRY_URL=https://psrc-xxx.region.aws.confluent.cloud

# Feature Flags
ENABLE_STREAMING=true          # Toggle Confluent on/off
ENABLE_AI_ROW_ANALYSIS=true    # Toggle per-row AI analysis
ENABLE_REALTIME_UPDATES=true   # Toggle WebSocket updates

# AI Providers (existing)
GEMINI_API_KEY=...
OPENAI_API_KEY=...
```

---

## Migration Strategy

### Step 1: Deploy Foundation (No Breaking Changes)

- Add new packages and files
- Add database migrations
- Feature flags default to `false`

### Step 2: Enable Smart Filtering

- Set `ENABLE_AI_ROW_ANALYSIS=true`
- New imports use smart filtering
- Existing data unchanged

### Step 3: Enable Streaming

- Set `ENABLE_STREAMING=true`
- New imports use Confluent
- BullMQ continues for other jobs

### Step 4: Enable Real-Time

- Set `ENABLE_REALTIME_UPDATES=true`
- WebSocket gateway activated
- UI shows live progress

---

## Success Metrics

| Metric                                 | Current           | Target               |
| -------------------------------------- | ----------------- | -------------------- |
| Turnover rows imported as transactions | Unknown %         | 0%                   |
| Categorization accuracy                | ~70% (heuristic)  | 90%+ (AI + rules)    |
| Import processing time (1000 rows)     | Sequential        | Parallel (3x faster) |
| Time to see categorization             | Polling (seconds) | Real-time (<100ms)   |
| Rules actually applied                 | 0%                | 100%                 |

---

## Testing Strategy

1. **Unit Tests**: New packages have full test coverage
2. **Integration Tests**: Test Confluent with local Kafka (docker-compose)
3. **E2E Tests**: Full import flow with sample bank CSVs
4. **Fallback Tests**: Verify graceful degradation when Confluent unavailable

---

## Timeline Phases

- **Phase 1**: Smart CSV Import (bank formats, row filtering, amount parsing)
- **Phase 2**: AI Row Analysis (header learning, per-row categorization)
- **Phase 3**: Fix Categorization (apply rules, enable OpenAI)
- **Phase 4**: Confluent Streaming (topics, consumers, real-time)
- **Phase 5**: Anomaly Detection (duplicate detection, spending alerts)

Each phase is independently deployable and adds value incrementally.
