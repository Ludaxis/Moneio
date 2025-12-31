/**
 * Header Learner - Learn from user corrections to improve header detection
 *
 * Stores user corrections and uses them to improve future header mappings.
 * Supports both in-memory and persistent storage strategies.
 */

import type { NormalizedColumnMapping } from './csv-header-normalizer';

/**
 * A learned header mapping from user correction
 */
export interface LearnedMapping {
  /** Original header text (normalized to lowercase for matching) */
  originalHeader: string;

  /** User-corrected column type */
  correctedType: NormalizedColumnMapping['normalized'];

  /** Number of times this correction has been made */
  frequency: number;

  /** Last time this mapping was used/confirmed */
  lastUsedAt: Date;

  /** Workspace ID for workspace-specific learnings */
  workspaceId?: string;

  /** Bank format ID if detected */
  bankFormatId?: string;
}

/**
 * Storage interface for header learnings
 */
export interface HeaderLearningStore {
  /** Get learned mappings for a header */
  getLearnings(header: string, workspaceId?: string): Promise<LearnedMapping[]>;

  /** Store a new learning from user correction */
  storeLearning(mapping: LearnedMapping): Promise<void>;

  /** Get all learnings for a workspace */
  getAllLearnings(workspaceId?: string): Promise<LearnedMapping[]>;

  /** Clear learnings for a workspace */
  clearLearnings(workspaceId?: string): Promise<void>;
}

/**
 * In-memory header learning store (for development/testing)
 */
export class InMemoryHeaderLearningStore implements HeaderLearningStore {
  private learnings: Map<string, LearnedMapping[]> = new Map();

  async getLearnings(header: string, workspaceId?: string): Promise<LearnedMapping[]> {
    const key = this.makeKey(header, workspaceId);
    return this.learnings.get(key) || [];
  }

  async storeLearning(mapping: LearnedMapping): Promise<void> {
    const key = this.makeKey(mapping.originalHeader, mapping.workspaceId);
    const existing = this.learnings.get(key) || [];

    // Find and update existing or add new
    const existingIdx = existing.findIndex(
      (l) => l.correctedType === mapping.correctedType
    );

    if (existingIdx >= 0) {
      existing[existingIdx].frequency += 1;
      existing[existingIdx].lastUsedAt = new Date();
    } else {
      existing.push({
        ...mapping,
        frequency: 1,
        lastUsedAt: new Date(),
      });
    }

    this.learnings.set(key, existing);
  }

  async getAllLearnings(workspaceId?: string): Promise<LearnedMapping[]> {
    const all: LearnedMapping[] = [];
    for (const [key, mappings] of this.learnings) {
      if (!workspaceId || key.includes(workspaceId)) {
        all.push(...mappings);
      }
    }
    return all;
  }

  async clearLearnings(workspaceId?: string): Promise<void> {
    if (workspaceId) {
      for (const key of this.learnings.keys()) {
        if (key.includes(workspaceId)) {
          this.learnings.delete(key);
        }
      }
    } else {
      this.learnings.clear();
    }
  }

  private makeKey(header: string, workspaceId?: string): string {
    const normalizedHeader = header.toLowerCase().trim();
    return workspaceId ? `${workspaceId}:${normalizedHeader}` : normalizedHeader;
  }
}

/**
 * Header Learner - applies learned mappings to improve header detection
 */
export class HeaderLearner {
  constructor(private readonly store: HeaderLearningStore) {}

  /**
   * Learn from a user correction
   */
  async learnCorrection(
    originalHeader: string,
    correctedType: NormalizedColumnMapping['normalized'],
    options?: {
      workspaceId?: string;
      bankFormatId?: string;
    }
  ): Promise<void> {
    await this.store.storeLearning({
      originalHeader: originalHeader.toLowerCase().trim(),
      correctedType,
      frequency: 1,
      lastUsedAt: new Date(),
      workspaceId: options?.workspaceId,
      bankFormatId: options?.bankFormatId,
    });
  }

  /**
   * Apply learned mappings to AI-suggested mappings
   * User corrections override AI suggestions with high confidence
   */
  async applyLearnings(
    aiMappings: NormalizedColumnMapping[],
    workspaceId?: string
  ): Promise<NormalizedColumnMapping[]> {
    const result: NormalizedColumnMapping[] = [];

    for (const mapping of aiMappings) {
      const learnings = await this.store.getLearnings(mapping.original, workspaceId);

      if (learnings.length > 0) {
        // Sort by frequency (most common correction first)
        learnings.sort((a, b) => b.frequency - a.frequency);
        const bestLearning = learnings[0];

        // User corrections get high confidence
        result.push({
          original: mapping.original,
          normalized: bestLearning.correctedType,
          confidence: Math.min(0.95, 0.7 + bestLearning.frequency * 0.05),
        });
      } else {
        result.push(mapping);
      }
    }

    return result;
  }

  /**
   * Suggest mappings based purely on learned patterns
   * (for when AI is unavailable or as a first pass)
   */
  async suggestFromLearnings(
    headers: string[],
    workspaceId?: string
  ): Promise<NormalizedColumnMapping[]> {
    const result: NormalizedColumnMapping[] = [];

    for (const header of headers) {
      const learnings = await this.store.getLearnings(header, workspaceId);

      if (learnings.length > 0) {
        learnings.sort((a, b) => b.frequency - a.frequency);
        const best = learnings[0];

        result.push({
          original: header,
          normalized: best.correctedType,
          confidence: Math.min(0.9, 0.5 + best.frequency * 0.1),
        });
      } else {
        result.push({
          original: header,
          normalized: null,
          confidence: 0,
        });
      }
    }

    return result;
  }

  /**
   * Get statistics about learned mappings
   */
  async getStats(workspaceId?: string): Promise<{
    totalLearnings: number;
    uniqueHeaders: number;
    topMappings: Array<{
      header: string;
      type: NormalizedColumnMapping['normalized'];
      frequency: number;
    }>;
  }> {
    const all = await this.store.getAllLearnings(workspaceId);

    const uniqueHeaders = new Set(all.map((l) => l.originalHeader)).size;

    const sorted = [...all].sort((a, b) => b.frequency - a.frequency);
    const topMappings = sorted.slice(0, 10).map((l) => ({
      header: l.originalHeader,
      type: l.correctedType,
      frequency: l.frequency,
    }));

    return {
      totalLearnings: all.length,
      uniqueHeaders,
      topMappings,
    };
  }
}

/**
 * Create a header learner with in-memory storage
 */
export function createHeaderLearner(store?: HeaderLearningStore): HeaderLearner {
  return new HeaderLearner(store || new InMemoryHeaderLearningStore());
}
