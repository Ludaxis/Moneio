// Common AI types
import type { AiEvidence, UUID } from '@moneio/core-ledger';

export interface ModelInfo {
  provider: string;
  model: string;
  version?: string;
}

export interface AiProposal<T> {
  data: T;
  confidence: number;
  evidence: AiEvidence[];
  modelInfo: ModelInfo;
}

export interface AiConfig {
  provider: 'openai' | 'anthropic' | 'local';
  apiKey?: string;
  model?: string;
  maxRetries?: number;
  timeout?: number;
}

export interface OcrConfig {
  provider: 'tesseract' | 'google-vision' | 'aws-textract' | 'azure-docai';
  apiKey?: string;
  endpoint?: string;
}

export interface EmbeddingConfig {
  provider: 'openai' | 'cohere' | 'local';
  model?: string;
  dimensions?: number;
}

export interface WorkspaceContext {
  workspaceId: UUID;
  locale: string;
  baseCurrency: string;
  vatRates?: number[];
  merchantNames?: string[];
  categoryNames?: string[];
}
