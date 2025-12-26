import { createHash } from 'crypto';

import { prisma } from '@moneio/db';
import { NextResponse } from 'next/server';

import { createServerClient } from '@/lib/supabase';
import { hasPermission } from '@/lib/workspace';

interface ImportTransaction {
  date: string;
  description: string;
  amount: number;
  balance?: number;
  reference?: string;
}

/**
 * POST /api/transactions/import
 * Import bank transactions from CSV data
 */
export async function POST(request: Request) {
  try {
    const supabase = createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { workspaceId, transactions, fileName } = body as {
      workspaceId: string;
      transactions: ImportTransaction[];
      fileName?: string;
    };

    if (!workspaceId || !transactions || !Array.isArray(transactions)) {
      return NextResponse.json(
        { error: 'workspaceId and transactions array are required' },
        { status: 400 }
      );
    }

    // Check permission
    const canWrite = await hasPermission(user.id, workspaceId, 'document:write');
    if (!canWrite) {
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
