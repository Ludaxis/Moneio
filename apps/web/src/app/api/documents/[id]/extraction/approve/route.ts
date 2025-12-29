import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const approveExtractionSchema = z.object({
  workspaceId: z.string().uuid(),
  extractionId: z.string().uuid(),
});

/**
 * Extraction payload types (from LLM output)
 */
interface InvoicePayload {
  kind: 'invoice';
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  vendorName?: string;
  vendorAddress?: string;
  vendorVatId?: string;
  currency?: string;
  subtotal?: number;
  vatTotal?: number;
  total?: number;
  lineItems?: Array<{
    description?: string;
    quantity?: number;
    unitPrice?: number;
    vatRate?: number;
    lineTotal?: number;
  }>;
}

interface ReceiptPayload {
  kind: 'receipt';
  merchantName?: string;
  merchantAddress?: string;
  date?: string;
  currency?: string;
  subtotal?: number;
  vatTotal?: number;
  total?: number;
  items?: Array<{
    description?: string;
    quantity?: number;
    unitPrice?: number;
    total?: number;
  }>;
}

type ExtractionPayload = InvoicePayload | ReceiptPayload | { kind?: string };

/**
 * Normalize merchant name for matching
 */
function normalizeMerchantName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Parse date string to Date object
 */
function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null;

  const isoDate = new Date(dateStr);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  const formats = [
    /^(\d{2})\/(\d{2})\/(\d{4})$/,
    /^(\d{2})-(\d{2})-(\d{4})$/,
    /^(\d{2})\.(\d{2})\.(\d{4})$/,
  ];

  for (const format of formats) {
    const match = dateStr.match(format);
    if (match) {
      const [, day, month, year] = match;
      return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    }
  }

  return null;
}

/**
 * Find or create merchant from vendor name
 */
async function findOrCreateMerchant(
  workspaceId: string,
  vendorName: string,
  vatNumber?: string
): Promise<string> {
  const normalizedName = normalizeMerchantName(vendorName);

  const existing = await prisma.merchant.findFirst({
    where: { workspaceId, normalizedName },
  });

  if (existing) {
    return existing.id;
  }

  let country: string | undefined;
  if (vatNumber && vatNumber.length >= 2) {
    const countryPrefix = vatNumber.substring(0, 2).toUpperCase();
    if (/^[A-Z]{2}$/.test(countryPrefix)) {
      country = countryPrefix;
    }
  }

  const merchant = await prisma.merchant.create({
    data: {
      workspaceId,
      name: vendorName,
      normalizedName,
      vatNumber: vatNumber || null,
      country: country || null,
    },
  });

  return merchant.id;
}

/**
 * Create invoice from extraction payload
 */
async function createInvoiceFromExtraction(
  workspaceId: string,
  documentId: string,
  payload: ExtractionPayload
): Promise<string | null> {
  if (payload.kind === 'invoice') {
    const invoicePayload = payload as InvoicePayload;

    let merchantId: string | null = null;
    if (invoicePayload.vendorName) {
      merchantId = await findOrCreateMerchant(
        workspaceId,
        invoicePayload.vendorName,
        invoicePayload.vendorVatId
      );
    }

    const invoice = await prisma.invoice.create({
      data: {
        workspaceId,
        documentId,
        merchantId,
        invoiceNumber: invoicePayload.invoiceNumber || null,
        issueDate: parseDate(invoicePayload.issueDate),
        dueDate: parseDate(invoicePayload.dueDate),
        currency: invoicePayload.currency || 'EUR',
        subtotal: invoicePayload.subtotal || 0,
        vatAmount: invoicePayload.vatTotal || 0,
        total: invoicePayload.total || 0,
        status: 'approved',
      },
    });

    if (invoicePayload.lineItems && invoicePayload.lineItems.length > 0) {
      await prisma.invoiceLineItem.createMany({
        data: invoicePayload.lineItems.map((item, index) => ({
          invoiceId: invoice.id,
          description: item.description || null,
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice || 0,
          amount: item.lineTotal || 0,
          vatRate: item.vatRate || null,
          sortOrder: index,
        })),
      });
    }

    return invoice.id;
  }

  if (payload.kind === 'receipt') {
    const receiptPayload = payload as ReceiptPayload;

    let merchantId: string | null = null;
    if (receiptPayload.merchantName) {
      merchantId = await findOrCreateMerchant(workspaceId, receiptPayload.merchantName);
    }

    const invoice = await prisma.invoice.create({
      data: {
        workspaceId,
        documentId,
        merchantId,
        invoiceNumber: null,
        issueDate: parseDate(receiptPayload.date),
        dueDate: null,
        currency: receiptPayload.currency || 'EUR',
        subtotal: receiptPayload.subtotal || 0,
        vatAmount: receiptPayload.vatTotal || 0,
        total: receiptPayload.total || 0,
        status: 'approved',
      },
    });

    if (receiptPayload.items && receiptPayload.items.length > 0) {
      await prisma.invoiceLineItem.createMany({
        data: receiptPayload.items.map((item, index) => ({
          invoiceId: invoice.id,
          description: item.description || null,
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice || 0,
          amount: item.total || 0,
          vatRate: null,
          sortOrder: index,
        })),
      });
    }

    return invoice.id;
  }

  return null;
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/documents/[id]/extraction/approve
 * Approve an extraction and create invoice from extracted data
 */
export async function POST(request: Request, { params }: RouteParams) {
  try {
    const { id: documentId } = await params;

    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > 64 * 1024) {
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    const supabase = createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = approveExtractionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { workspaceId, extractionId } = parsed.data;

    // Check permission - require document:approve permission
    const canApprove = await hasPermission(user.id, workspaceId, 'document:approve');
    if (!canApprove) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Get the extraction to verify it belongs to the document
    const extraction = await prisma.extraction.findFirst({
      where: {
        id: extractionId,
        documentId,
        document: { workspaceId },
      },
    });

    if (!extraction) {
      return NextResponse.json({ error: 'Extraction not found' }, { status: 404 });
    }

    if (extraction.approved) {
      return NextResponse.json({ error: 'Extraction already approved' }, { status: 400 });
    }

    // Approve extraction
    const updated = await prisma.extraction.update({
      where: { id: extractionId },
      data: {
        approved: true,
        approvedAt: new Date(),
        approvedBy: user.id,
      },
    });

    // Check if invoice already exists (backward compatibility)
    let invoiceId: string | null = null;
    const existingInvoice = await prisma.invoice.findFirst({
      where: {
        documentId,
        workspaceId,
      },
    });

    if (existingInvoice) {
      // Update existing invoice status
      await prisma.invoice.update({
        where: { id: existingInvoice.id },
        data: { status: 'approved' },
      });
      invoiceId = existingInvoice.id;
    } else {
      // Create invoice from extraction payload (new flow)
      const payload = extraction.payloadJson as ExtractionPayload;
      invoiceId = await createInvoiceFromExtraction(workspaceId, documentId, payload);
    }

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: 'extraction.approve',
        entityType: 'extraction',
        entityId: extractionId,
        oldValue: { approved: false },
        newValue: { approved: true },
        metadata: {
          documentId,
          version: extraction.version,
          invoiceId,
        },
      },
    });

    return NextResponse.json({ extraction: updated, invoiceId });
  } catch (error) {
    console.error('Failed to approve extraction:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
