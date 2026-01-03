/**
 * Documents API (serverless-friendly)
 *
 * GET /api/documents - List documents for a workspace
 * POST /api/documents - Create a new document
 *
 * Centralized through @moneio/app-services with shared auth, permissions,
 * rate limiting, and observability.
 */

import { withApi, documents } from '@moneio/app-services';
import type { DocumentStatus } from '@moneio/db';
import { traceApiRoute } from '@moneio/observability/integrations/nextjs';
import type { NextRequest } from 'next/server';

const { documentListQuerySchema, createDocumentBodySchema } = documents;

import { createDocument, getWorkspaceDocuments } from '@/lib/documents';
import { initWebObservability } from '@/lib/observability';
import { enqueueDocNormalize } from '@/lib/queue';

initWebObservability();

export const dynamic = 'force-dynamic';

/**
 * GET /api/documents
 *
 * Query params:
 * - workspaceId: required UUID
 * - limit: items per page (default 20, max 100)
 * - offset: skip items (default 0)
 * - status: filter by document status
 */
const listHandler = withApi(
  async ({ workspaceId, query }) => {
    // Handle pageSize -> limit mapping for backwards compatibility
    const limit = query.pageSize || query.limit;

    const result = await getWorkspaceDocuments(workspaceId, {
      limit,
      offset: query.offset,
      status: query.status as DocumentStatus | undefined,
    });
    return result;
  },
  {
    querySchema: documentListQuerySchema,
    permission: 'document:read',
    rateLimit: { type: 'workspace', limiter: 'api' },
  }
);

export const GET = traceApiRoute('documents.list', (request: NextRequest) =>
  listHandler(request)
);

/**
 * POST /api/documents
 *
 * Query params:
 * - workspaceId: required UUID
 *
 * Body:
 * - fileName: document file name
 * - mimeType: MIME type of the file
 * - fileSize: file size in bytes
 * - storagePath: path in storage
 */
const createHandler = withApi(
  async ({ workspaceId, body }) => {
    const document = await createDocument({
      workspaceId,
      fileName: body.fileName,
      mimeType: body.mimeType,
      fileSize: body.fileSize,
      storagePath: body.storagePath,
    });

    // Enqueue for processing
    await enqueueDocNormalize({
      documentId: document.id,
      workspaceId,
    });

    return document;
  },
  {
    bodySchema: createDocumentBodySchema,
    permission: 'document:create',
    rateLimit: { type: 'workspace', limiter: 'upload' },
  }
);

export const POST = traceApiRoute('documents.create', (request: NextRequest) =>
  createHandler(request)
);
