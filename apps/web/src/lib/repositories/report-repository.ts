/**
 * Prisma adapter for ReportRepository interface
 *
 * Implements the data access layer for accounting reports.
 */

import type { CurrencyCode, FxRate, UUID } from '@moneio/core-ledger';
import type { PrismaClient } from '@moneio/db';
import type {
  ReportRepository,
  GLAccountData,
  GLAccountBalance,
  JournalLineData,
  InvoiceData,
  ReportTransactionData,
  AccountType,
} from '@moneio/domain';

export function createPrismaReportRepository(prisma: PrismaClient): ReportRepository {
  return {
    async getGLAccounts(workspaceId: UUID): Promise<GLAccountData[]> {
      const accounts = await prisma.gLAccount.findMany({
        where: {
          workspaceId,
          isActive: true,
        },
        orderBy: { accountCode: 'asc' },
      });

      return accounts.map(
        (account): GLAccountData => ({
          id: account.id,
          accountCode: account.accountCode,
          accountName: account.accountName,
          accountType: account.accountType as AccountType,
          normalBalance: account.normalBalance as 'DEBIT' | 'CREDIT',
          parentId: account.parentId || undefined,
          subType: account.subType || undefined,
          isActive: account.isActive,
        })
      );
    },

    async getGLAccountBalances(workspaceId: UUID, asOfDate: string): Promise<GLAccountBalance[]> {
      const asOfDateObj = new Date(asOfDate);
      asOfDateObj.setHours(23, 59, 59, 999);

      // Get all accounts with their journal line totals up to asOfDate
      const accounts = await prisma.gLAccount.findMany({
        where: {
          workspaceId,
          isActive: true,
        },
        select: {
          id: true,
          normalBalance: true,
          journalLines: {
            where: {
              journalEntry: {
                status: 'POSTED',
                entryDate: { lte: asOfDateObj },
              },
            },
            select: {
              debitAmount: true,
              creditAmount: true,
            },
          },
        },
      });

      return accounts.map((account): GLAccountBalance => {
        const debitTotal = account.journalLines.reduce(
          (sum, line) => sum + Number(line.debitAmount),
          0
        );
        const creditTotal = account.journalLines.reduce(
          (sum, line) => sum + Number(line.creditAmount),
          0
        );

        // Calculate balance based on normal balance type
        const balance =
          account.normalBalance === 'DEBIT' ? debitTotal - creditTotal : creditTotal - debitTotal;

        return {
          accountId: account.id,
          debitTotal,
          creditTotal,
          balance,
        };
      });
    },

    async getGLAccountBalancesForPeriod(
      workspaceId: UUID,
      startDate: string,
      endDate: string
    ): Promise<GLAccountBalance[]> {
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);
      endDateObj.setHours(23, 59, 59, 999);

      // Get journal line totals for the period
      const accounts = await prisma.gLAccount.findMany({
        where: {
          workspaceId,
          isActive: true,
        },
        select: {
          id: true,
          normalBalance: true,
          journalLines: {
            where: {
              journalEntry: {
                status: 'POSTED',
                entryDate: {
                  gte: startDateObj,
                  lte: endDateObj,
                },
              },
            },
            select: {
              debitAmount: true,
              creditAmount: true,
            },
          },
        },
      });

      return accounts.map((account): GLAccountBalance => {
        const debitTotal = account.journalLines.reduce(
          (sum, line) => sum + Number(line.debitAmount),
          0
        );
        const creditTotal = account.journalLines.reduce(
          (sum, line) => sum + Number(line.creditAmount),
          0
        );

        // For P&L (income/expense), we want the net movement
        const balance =
          account.normalBalance === 'DEBIT' ? debitTotal - creditTotal : creditTotal - debitTotal;

        return {
          accountId: account.id,
          debitTotal,
          creditTotal,
          balance,
        };
      });
    },

    async getJournalLines(
      workspaceId: UUID,
      startDate: string,
      endDate: string,
      accountIds?: UUID[]
    ): Promise<JournalLineData[]> {
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);
      endDateObj.setHours(23, 59, 59, 999);

      const lines = await prisma.journalLine.findMany({
        where: {
          journalEntry: {
            workspaceId,
            status: 'POSTED',
            entryDate: {
              gte: startDateObj,
              lte: endDateObj,
            },
          },
          ...(accountIds && accountIds.length > 0 ? { glAccountId: { in: accountIds } } : {}),
        },
        include: {
          journalEntry: {
            select: {
              id: true,
              entryNumber: true,
              entryDate: true,
              description: true,
              referenceType: true,
              referenceId: true,
              status: true,
            },
          },
        },
        orderBy: [
          { journalEntry: { entryDate: 'asc' } },
          { journalEntry: { entryNumber: 'asc' } },
          { lineOrder: 'asc' },
        ],
      });

      return lines.map(
        (line): JournalLineData => ({
          entryId: line.journalEntry.id,
          entryNumber: line.journalEntry.entryNumber,
          entryDate: line.journalEntry.entryDate.toISOString().split('T')[0],
          description: line.description || line.journalEntry.description,
          accountId: line.glAccountId,
          debitAmount: Number(line.debitAmount),
          creditAmount: Number(line.creditAmount),
          referenceType: line.journalEntry.referenceType || undefined,
          referenceId: line.journalEntry.referenceId || undefined,
          status: line.journalEntry.status,
        })
      );
    },

    async getJournalLinesForAccount(
      workspaceId: UUID,
      accountId: UUID,
      startDate: string,
      endDate: string
    ): Promise<JournalLineData[]> {
      return this.getJournalLines(workspaceId, startDate, endDate, [accountId]);
    },

    async getOutstandingInvoices(
      workspaceId: UUID,
      asOfDate: string,
      type: 'receivables' | 'payables'
    ): Promise<InvoiceData[]> {
      const asOfDateObj = new Date(asOfDate);
      asOfDateObj.setHours(23, 59, 59, 999);

      // For now, all invoices are payables (expenses)
      // In future, add an invoiceType field to distinguish AR vs AP
      const invoices = await prisma.invoice.findMany({
        where: {
          workspaceId,
          issueDate: { lte: asOfDateObj },
          status: { in: ['pending', 'approved'] }, // Not fully paid
        },
        include: {
          merchant: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { issueDate: 'asc' },
      });

      return invoices.map(
        (invoice): InvoiceData => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber || undefined,
          merchantId: invoice.merchant?.id,
          merchantName: invoice.merchant?.name,
          issueDate: (invoice.issueDate || new Date()).toISOString().split('T')[0],
          dueDate: invoice.dueDate?.toISOString().split('T')[0],
          total: Number(invoice.total),
          paidAmount: invoice.status === 'paid' ? Number(invoice.total) : 0,
          currency: invoice.currency as CurrencyCode,
          status: invoice.status,
          isReceivable: type === 'receivables',
        })
      );
    },

    async getTransactionsForPeriod(
      workspaceId: UUID,
      startDate: string,
      endDate: string
    ): Promise<ReportTransactionData[]> {
      const startDateObj = new Date(startDate);
      const endDateObj = new Date(endDate);
      endDateObj.setHours(23, 59, 59, 999);

      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: {
            gte: startDateObj,
            lte: endDateObj,
          },
        },
        include: {
          categorizations: {
            where: { approved: true },
            take: 1,
            include: {
              category: {
                select: {
                  id: true,
                  name: true,
                  glAccountId: true,
                },
              },
            },
          },
        },
        orderBy: { postedAt: 'asc' },
      });

      return transactions.map((tx): ReportTransactionData => {
        const categorization = tx.categorizations[0];
        return {
          id: tx.id,
          postedAt: tx.postedAt.toISOString().split('T')[0],
          amount: Number(tx.amount),
          currency: tx.currency as CurrencyCode,
          categoryId: categorization?.category.id,
          categoryName: categorization?.category.name,
          glAccountId: categorization?.category.glAccountId || undefined,
        };
      });
    },

    async getFxRates(baseCurrency: CurrencyCode): Promise<FxRate[]> {
      const rates = await prisma.fxRate.findMany({
        where: {
          baseCurrency,
        },
        orderBy: { effectiveDate: 'desc' },
        distinct: ['quoteCurrency'],
      });

      return rates.map(
        (rate): FxRate => ({
          baseCurrency: rate.baseCurrency as CurrencyCode,
          quoteCurrency: rate.quoteCurrency as CurrencyCode,
          rate: Number(rate.rate),
          provider: rate.source,
          fetchedAt: rate.effectiveDate.toISOString(),
        })
      );
    },

    async getOpeningBalance(
      workspaceId: UUID,
      accountId: UUID,
      beforeDate: string
    ): Promise<number> {
      const beforeDateObj = new Date(beforeDate);

      // Get account to determine normal balance
      const account = await prisma.gLAccount.findUnique({
        where: { id: accountId },
        select: { normalBalance: true },
      });

      if (!account) return 0;

      // Sum all journal lines before the start date
      const result = await prisma.journalLine.aggregate({
        where: {
          glAccountId: accountId,
          journalEntry: {
            workspaceId,
            status: 'POSTED',
            entryDate: { lt: beforeDateObj },
          },
        },
        _sum: {
          debitAmount: true,
          creditAmount: true,
        },
      });

      const debitTotal = Number(result._sum.debitAmount || 0);
      const creditTotal = Number(result._sum.creditAmount || 0);

      return account.normalBalance === 'DEBIT'
        ? debitTotal - creditTotal
        : creditTotal - debitTotal;
    },

    async getCashAccountsBalance(workspaceId: UUID, asOfDate: string): Promise<number> {
      const asOfDateObj = new Date(asOfDate);
      asOfDateObj.setHours(23, 59, 59, 999);

      // Find cash accounts by subtype or name pattern
      const cashAccounts = await prisma.gLAccount.findMany({
        where: {
          workspaceId,
          isActive: true,
          accountType: 'ASSET',
          OR: [
            { subType: { contains: 'cash', mode: 'insensitive' } },
            { subType: { contains: 'bank', mode: 'insensitive' } },
            { accountName: { contains: 'cash', mode: 'insensitive' } },
            { accountName: { contains: 'bank', mode: 'insensitive' } },
            { accountName: { contains: 'checking', mode: 'insensitive' } },
            { accountName: { contains: 'savings', mode: 'insensitive' } },
          ],
        },
        select: {
          id: true,
          normalBalance: true,
          journalLines: {
            where: {
              journalEntry: {
                status: 'POSTED',
                entryDate: { lte: asOfDateObj },
              },
            },
            select: {
              debitAmount: true,
              creditAmount: true,
            },
          },
        },
      });

      let totalCash = 0;
      for (const account of cashAccounts) {
        const debitTotal = account.journalLines.reduce(
          (sum, line) => sum + Number(line.debitAmount),
          0
        );
        const creditTotal = account.journalLines.reduce(
          (sum, line) => sum + Number(line.creditAmount),
          0
        );

        const balance =
          account.normalBalance === 'DEBIT' ? debitTotal - creditTotal : creditTotal - debitTotal;

        totalCash += balance;
      }

      return totalCash;
    },
  };
}
