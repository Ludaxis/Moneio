import { createHash } from 'crypto';

import { prisma } from '@moneio/db';
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
});

const importSchema = z.object({
  workspaceId: z.string().uuid(),
  transactions: z.array(transactionSchema).min(1).max(MAX_TRANSACTIONS),
  fileName: z.string().max(512).optional(),
});

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

    for (const tx of transactions) {
      // Create unique hash for deduplication
      const txHash = createHash('sha256')
        .update(`${tx.date}|${tx.description}|${tx.amount}|${tx.reference || ''}`)
        .digest('hex');

      // Check if already exists
      const existing = await prisma.bankTransaction.findFirst({
        where: {
          workspaceId,
          txHash,
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      // Parse date
      let postedAt: Date;
      try {
        postedAt = new Date(tx.date);
        if (isNaN(postedAt.getTime())) {
          // Try alternate parsing
          const parts = tx.date.split(/[-/.]/);
          if (parts.length === 3) {
            // Assume YYYY-MM-DD or DD-MM-YYYY
            if (parts[0].length === 4) {
              postedAt = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
            } else {
              postedAt = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
            }
          }
        }
      } catch {
        postedAt = new Date();
      }

      await prisma.bankTransaction.create({
        data: {
          workspaceId,
          bankAccountId: bankAccount.id,
          txHash,
          postedAt,
          description: tx.description || null,
          amount: tx.amount,
          currency: bankAccount.currency,
          balance: tx.balance ?? null,
          rawData: {
            imported: true,
            fileName,
            reference: tx.reference,
          },
        },
      });

      imported++;
    }

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
