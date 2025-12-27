# ADR-0003: AI Layer Architecture

## Status

Accepted

## Context

The application needs to integrate AI capabilities for document extraction, transaction categorization, invoice matching, and financial Q&A. These capabilities should be provider-agnostic and include human-in-the-loop verification.

## Decision

Implement an AI adapter pattern with:

1. Provider-agnostic interfaces
2. Zod schema validation for all outputs
3. Evidence/citation tracking for explainability
4. Confidence scoring for all proposals

### Interface Design

```typescript
interface AiProposal<T> {
  data: T;
  confidence: number; // 0-100
  evidence: AiEvidence[]; // Citations, bounding boxes
  modelInfo: ModelInfo; // Provider, model, version
}

interface InvoiceExtractorAdapter {
  extractInvoice(
    ocr: OcrPayload,
    context: WorkspaceContext
  ): Promise<AiProposal<InvoiceExtraction>>;
}
```

### Modules

- `extraction/` - Document data extraction (invoice, statement, receipt)
- `categorization/` - Transaction categorization with rules fallback
- `chat/` - RAG-powered financial Q&A

### Human-in-the-Loop

- All AI outputs are "suggestions" until user approval
- Evidence is displayed alongside extracted fields
- User corrections feed the evaluation dataset

## Consequences

Pros:

- Easy to swap AI providers without code changes
- Consistent output format with validation
- Evidence tracking enables trust and debugging
- Heuristic fallbacks reduce API costs

Cons:

- Additional abstraction layer complexity
- Prompt engineering per document type/locale
- Requires careful confidence calibration

## Alternatives

- Direct LLM API calls (rejected: no consistency, harder to test)
- Pre-built extraction services (rejected: less control, higher cost)
