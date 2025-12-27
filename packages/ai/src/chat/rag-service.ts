// RAG (Retrieval-Augmented Generation) service
import type { UUID } from '@moneio/core-ledger';

export interface RetrievedDocument {
  id: UUID;
  type: 'document' | 'invoice' | 'transaction';
  title?: string;
  content: string;
  date?: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface EmbeddingAdapter {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface VectorStore {
  upsert(id: string, embedding: number[], metadata: Record<string, unknown>): Promise<void>;
  query(
    embedding: number[],
    topK: number,
    filter?: Record<string, unknown>
  ): Promise<Array<{ id: string; score: number; metadata: Record<string, unknown> }>>;
  delete(id: string): Promise<void>;
}

export interface RagService {
  index(
    id: UUID,
    type: 'document' | 'invoice' | 'transaction',
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void>;
  retrieve(query: string, workspaceId: UUID, topK?: number): Promise<RetrievedDocument[]>;
  deleteIndex(id: UUID): Promise<void>;
}

export class FinancialRagService implements RagService {
  constructor(
    private readonly embedding: EmbeddingAdapter,
    private readonly vectorStore: VectorStore,
    private readonly contentStore: Map<string, RetrievedDocument> = new Map()
  ) {}

  async index(
    id: UUID,
    type: 'document' | 'invoice' | 'transaction',
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    // Generate embedding
    const embedding = await this.embedding.embed(content);

    // Store in vector database
    await this.vectorStore.upsert(id, embedding, {
      type,
      workspaceId: metadata?.workspaceId,
      ...metadata,
    });

    // Store content for retrieval
    this.contentStore.set(id, {
      id,
      type,
      content,
      date: metadata?.date as string | undefined,
      score: 0,
      metadata,
    });
  }

  async retrieve(query: string, workspaceId: UUID, topK = 5): Promise<RetrievedDocument[]> {
    // Generate query embedding
    const queryEmbedding = await this.embedding.embed(query);

    // Search vector store
    const results = await this.vectorStore.query(queryEmbedding, topK, {
      workspaceId,
    });

    // Retrieve full documents
    return results
      .map((result) => {
        const doc = this.contentStore.get(result.id);
        if (!doc) return null;

        return {
          ...doc,
          score: result.score,
        };
      })
      .filter((doc): doc is RetrievedDocument => doc !== null);
  }

  async deleteIndex(id: UUID): Promise<void> {
    await this.vectorStore.delete(id);
    this.contentStore.delete(id);
  }
}

// In-memory vector store for development/testing
export class InMemoryVectorStore implements VectorStore {
  private readonly vectors: Map<
    string,
    { embedding: number[]; metadata: Record<string, unknown> }
  > = new Map();

  async upsert(id: string, embedding: number[], metadata: Record<string, unknown>): Promise<void> {
    this.vectors.set(id, { embedding, metadata });
  }

  async query(
    queryEmbedding: number[],
    topK: number,
    filter?: Record<string, unknown>
  ): Promise<Array<{ id: string; score: number; metadata: Record<string, unknown> }>> {
    const results: Array<{ id: string; score: number; metadata: Record<string, unknown> }> = [];

    for (const [id, { embedding, metadata }] of this.vectors) {
      // Apply filter
      if (filter) {
        let matches = true;
        for (const [key, value] of Object.entries(filter)) {
          if (metadata[key] !== value) {
            matches = false;
            break;
          }
        }
        if (!matches) continue;
      }

      // Calculate cosine similarity
      const score = this.cosineSimilarity(queryEmbedding, embedding);
      results.push({ id, score, metadata });
    }

    // Sort by score and return top K
    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  async delete(id: string): Promise<void> {
    this.vectors.delete(id);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
}

// Mock embedding adapter for development
export class MockEmbeddingAdapter implements EmbeddingAdapter {
  private readonly dimensions: number;

  constructor(dimensions = 1536) {
    this.dimensions = dimensions;
  }

  async embed(text: string): Promise<number[]> {
    // Generate deterministic pseudo-embedding based on text hash
    const embedding: number[] = [];
    let hash = 0;

    for (let i = 0; i < text.length; i++) {
      hash = (hash << 5) - hash + text.charCodeAt(i);
      hash = hash & hash;
    }

    for (let i = 0; i < this.dimensions; i++) {
      // Use hash to seed pseudo-random values
      hash = (hash * 1103515245 + 12345) & 0x7fffffff;
      embedding.push((hash / 0x7fffffff) * 2 - 1);
    }

    // Normalize
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map((val) => val / norm);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((text) => this.embed(text)));
  }
}
