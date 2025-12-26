// Document service - business logic for document management
import type {
  Document,
  DocumentBlob,
  DocumentSource,
  DocumentStatus,
  DocumentType,
  UUID,
} from '@moneio/core-ledger';

export interface DocumentRepository {
  create(doc: CreateDocumentData): Promise<Document>;
  findById(id: UUID): Promise<Document | null>;
  findByWorkspace(
    workspaceId: UUID,
    options?: DocumentQueryOptions
  ): Promise<{ items: Document[]; total: number }>;
  update(id: UUID, data: UpdateDocumentData): Promise<Document>;
  delete(id: UUID): Promise<void>;
  createBlob(blob: CreateBlobData): Promise<DocumentBlob>;
  findBlobByDocumentId(documentId: UUID): Promise<DocumentBlob | null>;
}

export interface CreateDocumentData {
  workspaceId: UUID;
  type: DocumentType;
  status: DocumentStatus;
  fileName: string;
  mimeType: string;
  pageCount: number;
  source: DocumentSource;
  createdByUserId: UUID;
}

export interface UpdateDocumentData {
  type?: DocumentType;
  status?: DocumentStatus;
  pageCount?: number;
}

export interface CreateBlobData {
  documentId: UUID;
  storageProvider: 'local' | 's3' | 'gcs' | 'azure';
  storageKey: string;
  sha256: string;
  sizeBytes: number;
}

export interface DocumentQueryOptions {
  type?: DocumentType;
  status?: DocumentStatus;
  limit?: number;
  offset?: number;
}

export interface StorageAdapter {
  upload(file: Buffer, key: string): Promise<string>;
  download(key: string): Promise<Buffer>;
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  delete(key: string): Promise<void>;
}

export class DocumentService {
  constructor(
    private readonly repository: DocumentRepository,
    private readonly storage: StorageAdapter
  ) {}

  async createDocument(
    data: Omit<CreateDocumentData, 'status'>,
    fileContent: Buffer
  ): Promise<{ document: Document; blob: DocumentBlob }> {
    // Create document record
    const document = await this.repository.create({
      ...data,
      status: 'uploaded',
    });

    // Generate storage key and upload
    const storageKey = this.generateStorageKey(document.id, data.fileName);
    await this.storage.upload(fileContent, storageKey);

    // Calculate file hash
    const sha256 = await this.calculateSha256(fileContent);

    // Create blob record
    const blob = await this.repository.createBlob({
      documentId: document.id,
      storageProvider: 'local', // Could be configurable
      storageKey,
      sha256,
      sizeBytes: fileContent.length,
    });

    return { document, blob };
  }

  async getDocument(id: UUID): Promise<Document | null> {
    return this.repository.findById(id);
  }

  async getDocumentsByWorkspace(
    workspaceId: UUID,
    options?: DocumentQueryOptions
  ): Promise<{ items: Document[]; total: number }> {
    return this.repository.findByWorkspace(workspaceId, options);
  }

  async updateDocumentStatus(id: UUID, status: DocumentStatus): Promise<Document> {
    return this.repository.update(id, { status });
  }

  async getDocumentDownloadUrl(id: UUID, expiresInSeconds = 3600): Promise<string | null> {
    const blob = await this.repository.findBlobByDocumentId(id);
    if (!blob) return null;

    return this.storage.getSignedUrl(blob.storageKey, expiresInSeconds);
  }

  async deleteDocument(id: UUID): Promise<void> {
    const blob = await this.repository.findBlobByDocumentId(id);
    if (blob) {
      await this.storage.delete(blob.storageKey);
    }
    await this.repository.delete(id);
  }

  private generateStorageKey(documentId: UUID, fileName: string): string {
    const ext = fileName.split('.').pop() || 'bin';
    return `documents/${documentId}.${ext}`;
  }

  private async calculateSha256(buffer: Buffer): Promise<string> {
    // This would use crypto module in actual implementation
    // For now, return a placeholder
    const encoder = new TextEncoder();
    const data = encoder.encode(buffer.toString());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}
