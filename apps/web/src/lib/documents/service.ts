import { prisma, DocumentStatus } from '@moneio/db';

import { createSignedReadUrl } from '@/lib/storage';

export interface CreateDocumentInput {
  workspaceId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storagePath: string;
}

/**
 * Create a new document record after upload is complete
 */
export async function createDocument(input: CreateDocumentInput) {
  const document = await prisma.document.create({
    data: {
      workspaceId: input.workspaceId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      fileSize: input.fileSize,
      status: DocumentStatus.uploaded,
      blobs: {
        create: {
          storagePath: input.storagePath,
          blobType: 'original',
        },
      },
    },
    include: {
      blobs: true,
    },
  });

  return document;
}

/**
 * Get documents for a workspace with pagination
 */
export async function getWorkspaceDocuments(
  workspaceId: string,
  options: {
    limit?: number;
    offset?: number;
    status?: DocumentStatus;
  } = {}
) {
  const { limit = 20, offset = 0, status } = options;

  const where = {
    workspaceId,
    ...(status && { status }),
  };

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      include: {
        blobs: true,
        extractions: {
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.document.count({ where }),
  ]);

  return { documents, total };
}

/**
 * Get a single document with all related data
 */
export async function getDocument(documentId: string, workspaceId: string) {
  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      workspaceId,
    },
    include: {
      blobs: true,
      ocrArtifacts: {
        orderBy: { pageNumber: 'asc' },
      },
      extractions: {
        orderBy: { version: 'desc' },
      },
      invoices: true,
    },
  });

  return document;
}

/**
 * Get signed URL for viewing a document
 */
export async function getDocumentViewUrl(documentId: string, workspaceId: string) {
  const document = await prisma.document.findFirst({
    where: {
      id: documentId,
      workspaceId,
    },
    include: {
      blobs: {
        where: { blobType: 'original' },
        take: 1,
      },
    },
  });

  if (!document || document.blobs.length === 0) {
    return null;
  }

  const signedUrl = await createSignedReadUrl(document.blobs[0].storagePath);
  return signedUrl;
}

/**
 * Update document status
 */
export async function updateDocumentStatus(
  documentId: string,
  status: DocumentStatus,
  failReason?: string
) {
  return prisma.document.update({
    where: { id: documentId },
    data: {
      status,
      ...(failReason && { failReason }),
    },
  });
}

/**
 * Mark document as failed
 */
export async function markDocumentFailed(documentId: string, reason: string) {
  return updateDocumentStatus(documentId, DocumentStatus.failed, reason);
}
