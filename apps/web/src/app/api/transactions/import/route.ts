import { createHash } from 'crypto';

import { prisma } from '@moneio/db';
import { normalizeMerchantName } from '@moneio/domain';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

export const dynamic = 'force-dynamic';

const MAX_IMPORT_BYTES = 2 * 1024 * 1024; // 2MB
const MAX_TRANSACTIONS = 2000;

const transactionSchema = z.object({
  date: z.string().min(1).max(100),
  description: z.string().max(512), // Allow empty descriptions
  amount: z.number().finite(),
  balance: z.number().finite().optional().nullable(),
  reference: z.string().max(256).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(), // Pre-assigned category from import
  counterpartyName: z.string().max(256).optional().nullable(), // Merchant/payee name for learning
});

const importSchema = z.object({
  workspaceId: z.string().uuid(),
  transactions: z.array(transactionSchema).min(1).max(MAX_TRANSACTIONS),
  fileName: z.string().max(512).optional(),
});

function parsePostedAt(dateString: string): Date {
  try {
    const direct = new Date(dateString);
    if (!isNaN(direct.getTime())) {
      return direct;
    }

    const parts = dateString.split(/[-/.]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      }
      return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
    }
  } catch {
    // fall through to now()
  }

  return new Date();
}

/**
 * POST /api/transactions/import
 * Import bank transactions from CSV data
 */
export async function POST(request: Request) {
  try {
    const contentLength = request.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_IMPORT_BYTES) {
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
    const parsed = importSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const { workspaceId, transactions, fileName } = parsed.data;

    // Check permission
    const canCreateTransactions = await hasPermission(user.id, workspaceId, 'transaction:create');
    if (!canCreateTransactions) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    // Get or create default bank account
    let bankAccount = await prisma.bankAccount.findFirst({
      where: { workspaceId },
    });

    if (!bankAccount) {
      // Get workspace for default currency
      const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
      });

      bankAccount = await prisma.bankAccount.create({
        data: {
          workspaceId,
          name: 'Default Account',
          currency: workspace?.baseCurrency || 'EUR',
        },
      });
    }

    let imported = 0;
    let skipped = 0;

    // Precompute hashes and normalized dates up front
    const prepared = transactions.map((tx) => {
      const txHash = createHash('sha256')
        .update(`${tx.date}|${tx.description}|${tx.amount}|${tx.reference || ''}`)
        .digest('hex');

      return {
        ...tx,
        txHash,
        postedAt: parsePostedAt(tx.date),
      };
    });

    // Fetch existing hashes in a single query to avoid per-row round-trips
    const existing = await prisma.bankTransaction.findMany({
      where: {
        workspaceId,
        txHash: { in: Array.from(new Set(prepared.map((p) => p.txHash))) },
      },
      select: { txHash: true },
    });
    const existingHashes = new Set(existing.map((e) => e.txHash));

    // Separate transactions to create and their category assignments
    const toCreate = prepared.filter((tx) => !existingHashes.has(tx.txHash));

    const createPayload = toCreate.map((tx) => ({
      workspaceId,
      bankAccountId: bankAccount.id,
      txHash: tx.txHash,
      postedAt: tx.postedAt,
      description: tx.description || null,
      amount: tx.amount,
      currency: bankAccount.currency,
      balance: tx.balance ?? null,
      rawData: {
        imported: true,
        fileName,
        reference: tx.reference,
      },
    }));

    if (createPayload.length > 0) {
      const result = await prisma.bankTransaction.createMany({
        data: createPayload,
        skipDuplicates: true, // extra safety if a concurrent import races
      });
      imported = result.count;

      // Create categorization records for transactions with pre-assigned categories
      const txsWithCategories = toCreate.filter((tx) => tx.categoryId);
      if (txsWithCategories.length > 0) {
        // Get the created transaction IDs by their hashes
        const createdTxs = await prisma.bankTransaction.findMany({
          where: {
            workspaceId,
            txHash: { in: txsWithCategories.map((tx) => tx.txHash) },
          },
          select: { id: true, txHash: true },
        });

        const hashToId = new Map(createdTxs.map((tx) => [tx.txHash, tx.id]));

        // Create categorization records
        const categorizationPayload = txsWithCategories
          .filter((tx) => hashToId.has(tx.txHash) && tx.categoryId)
          .map((tx) => ({
            workspaceId,
            transactionId: hashToId.get(tx.txHash)!,
            categoryId: tx.categoryId!,
            confidence: 1.0, // User-selected during import
            source: 'manual',
            approved: true,
            approvedAt: new Date(),
            approvedBy: user.id,
          }));

        if (categorizationPayload.length > 0) {
          await prisma.transactionCategorization.createMany({
            data: categorizationPayload,
            skipDuplicates: true,
          });
        }
      }

      // Learn from user's category selections
      await learnFromCategorySelections(workspaceId, toCreate);
    }

    skipped = transactions.length - imported;

    // Create audit log entry
    await prisma.auditLog.create({
      data: {
        workspaceId,
        userId: user.id,
        action: 'transaction.import',
        entityType: 'bank_transaction',
        entityId: bankAccount.id,
        newValue: {
          imported,
          skipped,
          fileName,
        },
      },
    });

    return NextResponse.json({
      imported,
      skipped,
      total: transactions.length,
    });
  } catch (error) {
    console.error('Failed to import transactions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Learn from user's category selections during import
 * Stores merchant->category mappings for future predictions
 */
async function learnFromCategorySelections(
  workspaceId: string,
  transactions: Array<{
    categoryId?: string | null;
    counterpartyName?: string | null;
    description?: string | null;
  }>
): Promise<void> {
  // Filter to transactions with both category and merchant/description
  const learnable = transactions.filter(
    (tx) => tx.categoryId && (tx.counterpartyName || tx.description)
  );

  if (learnable.length === 0) return;

  // Aggregate by normalized pattern + category
  const aggregated = new Map<
    string,
    { merchantPattern: string; merchantName: string; categoryId: string; count: number }
  >();

  for (const tx of learnable) {
    const merchantName = tx.counterpartyName || tx.description || '';
    const merchantPattern = normalizeMerchantName(merchantName);

    if (!merchantPattern || !tx.categoryId) continue;

    const key = `${merchantPattern}:${tx.categoryId}`;
    const existing = aggregated.get(key);

    if (existing) {
      existing.count++;
    } else {
      aggregated.set(key, {
        merchantPattern,
        merchantName,
        categoryId: tx.categoryId,
        count: 1,
      });
    }
  }

  // Upsert mappings
  for (const mapping of aggregated.values()) {
    try {
      await prisma.merchantCategoryMapping.upsert({
        where: {
          workspaceId_merchantPattern: {
            workspaceId,
            merchantPattern: mapping.merchantPattern,
          },
        },
        create: {
          workspaceId,
          merchantPattern: mapping.merchantPattern,
          merchantName: mapping.merchantName,
          categoryId: mapping.categoryId,
          frequency: mapping.count,
          confidence: 0.9, // High confidence for user selections
          source: 'imported',
        },
        update: {
          categoryId: mapping.categoryId,
          merchantName: mapping.merchantName,
          frequency: { increment: mapping.count },
          // Increase confidence with each use (max 0.99)
          confidence: 0.99,
          lastUsedAt: new Date(),
        },
      });
    } catch (error) {
      // Log but don't fail the import if learning fails
      console.warn('[Import] Failed to learn mapping:', mapping.merchantPattern, error);
    }
  }

  console.log(`[Import] Learned ${aggregated.size} merchant->category mappings`);
}
