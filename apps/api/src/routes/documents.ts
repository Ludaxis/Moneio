// Document routes
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const uploadSchema = z.object({
  workspaceId: z.string().uuid(),
  type: z.enum(['invoice', 'statement', 'receipt', 'other']).optional(),
  source: z.enum(['upload', 'email', 'mobile']).optional(),
});

const querySchema = z.object({
  workspaceId: z.string().uuid(),
  type: z.enum(['invoice', 'statement', 'receipt', 'other']).optional(),
  status: z.enum(['uploaded', 'processing', 'ready', 'failed']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const documentsRoutes = new Hono();

// Upload document
documentsRoutes.post('/upload', async (c) => {
  // In production, this would handle multipart form data
  const body = await c.req.json();

  // Validate
  const validation = uploadSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ error: 'Invalid request', details: validation.error.issues }, 400);
  }

  // TODO: Implement file upload handling
  // 1. Parse multipart form
  // 2. Validate file type
  // 3. Store file
  // 4. Create document record
  // 5. Queue for processing

  return c.json({
    id: crypto.randomUUID(),
    status: 'uploaded',
    message: 'Document uploaded successfully',
  });
});

// Get document by ID
documentsRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');

  // TODO: Fetch from database
  // const document = await documentService.getDocument(id);

  return c.json({
    id,
    workspaceId: 'workspace-id',
    type: 'invoice',
    status: 'ready',
    fileName: 'invoice.pdf',
    mimeType: 'application/pdf',
    pageCount: 2,
    source: 'upload',
    createdAt: new Date().toISOString(),
  });
});

// List documents
documentsRoutes.get('/', zValidator('query', querySchema), async (c) => {
  const query = c.req.valid('query');

  // TODO: Fetch from database with filters
  // const { items, total } = await documentService.getDocumentsByWorkspace(
  //   query.workspaceId,
  //   query
  // );

  return c.json({
    items: [],
    total: 0,
    limit: query.limit || 20,
    offset: query.offset || 0,
    hasMore: false,
  });
});

// Retry document processing
documentsRoutes.post('/:id/retry', async (c) => {
  const id = c.req.param('id');

  // TODO: Queue for reprocessing
  // await documentService.updateDocumentStatus(id, 'uploaded');
  // await queueService.enqueue('document:process', { documentId: id });

  return c.json({
    id,
    status: 'processing',
    message: 'Document queued for reprocessing',
  });
});

// Approve extraction
documentsRoutes.post('/:id/approve-extraction', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  // TODO: Approve extraction and create entities
  // await documentService.approveExtraction(id, body);

  return c.json({
    id,
    message: 'Extraction approved',
    createdEntities: body,
  });
});

// Get document download URL
documentsRoutes.get('/:id/download', async (c) => {
  const id = c.req.param('id');

  // TODO: Generate signed URL
  // const url = await documentService.getDocumentDownloadUrl(id);

  return c.json({
    url: `https://storage.example.com/documents/${id}?signature=xxx`,
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
  });
});

// Delete document
documentsRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');

  // TODO: Delete document and associated data
  // await documentService.deleteDocument(id);

  return c.json({
    id,
    message: 'Document deleted',
  });
});
