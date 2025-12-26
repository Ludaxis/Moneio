# ADR-0004: Document Ingestion Pipeline

## Status
Accepted

## Context
Documents (invoices, statements, receipts) need to be processed through multiple stages: upload, normalization, OCR, extraction, post-processing, and indexing. Each stage can fail and may require retries.

## Decision
Implement a state-machine based pipeline with BullMQ for job orchestration.

### Pipeline States
```
uploaded → normalizing → ocr → extracting → postprocessing → indexing → ready
                                    ↓
                                 failed
```

### Job Types
1. **DOC_NORMALIZE** - Convert images/PDFs, split pages, optimize
2. **DOC_OCR** - OCR + layout/table extraction
3. **DOC_EXTRACT** - AI-powered structured extraction
4. **DOC_POSTPROCESS** - Merchant normalization, category suggestions
5. **DOC_INDEX** - Create embeddings for RAG (optional)

### Error Handling
- Exponential backoff for transient failures
- Max 3 retries per stage
- Failed documents allow manual entry fallback
- Each stage saves intermediate results

### Concurrency
- 5 concurrent document workers
- Rate limiting for external OCR/LLM APIs
- Priority queue for user-initiated retries

## Consequences

Pros:
- Resilient to partial failures
- Observable progress through state tracking
- Async processing doesn't block uploads
- Intermediate results enable debugging

Cons:
- Complex state management
- Redis dependency for BullMQ
- Requires careful timeout configuration

## Alternatives
- Synchronous processing (rejected: too slow for multi-page documents)
- AWS Step Functions (rejected: vendor lock-in, overkill for initial version)
