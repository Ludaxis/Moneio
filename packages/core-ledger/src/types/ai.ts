// AI suggestion types

import type { EntityBase, UUID } from './common';
import type { BoundingBox } from './documents';

export type AiSubjectType = 'invoice' | 'transaction' | 'document' | 'match';

export type AiSuggestionType = 'extract' | 'categorize' | 'match' | 'enrich';

export interface AiSuggestion extends EntityBase {
  subjectType: AiSubjectType;
  subjectId: UUID;
  suggestionType: AiSuggestionType;
  payloadJson: unknown;
  confidence: number;
  evidenceJson?: AiEvidence[];
  modelInfo?: string;
  status: 'pending' | 'accepted' | 'rejected';
  reviewedAt?: string;
  reviewedByUserId?: UUID;
}

export interface AiEvidence {
  documentId?: UUID;
  page?: number;
  boundingBox?: BoundingBox;
  sourceText?: string;
  reasoning?: string;
}

// Audit Log
export interface AuditLogEntry {
  id: UUID;
  workspaceId: UUID;
  actorUserId?: UUID;
  action: string;
  entityType: string;
  entityId: UUID;
  beforeJson?: unknown;
  afterJson?: unknown;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

// Chat types
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  citations?: ChatCitation[];
  timestamp: string;
}

export interface ChatCitation {
  type: 'document' | 'invoice' | 'transaction';
  id: UUID;
  title: string;
  snippet?: string;
  page?: number;
  boundingBox?: BoundingBox;
}

export interface ChatContext {
  workspaceId: UUID;
  conversationId: UUID;
  messages: ChatMessage[];
}
