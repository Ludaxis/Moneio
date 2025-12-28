/**
 * Prisma adapter for ReportingRepository interface
 *
 * Bridges the domain ReportingService with the Prisma database layer.
 */

import type { CurrencyCode, FxRate, UUID } from '@moneio/core-ledger';
import type { PrismaClient } from '@moneio/db';
import type {
  ReportingRepository,
  TransactionSummary,
  InvoiceSummary,
  VatEntry,
} from '@moneio/domain';

export function createPrismaReportingRepository(prisma: PrismaClient): ReportingRepository {
  return {
    async getTransactionsByPeriod(
      workspaceId: UUID,
      startDate: string,
      endDate: string
    ): Promise<TransactionSummary[]> {
      const transactions = await prisma.bankTransaction.findMany({
        where: {
          workspaceId,
          postedAt: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        },
        include: {
          categorizations: {
            where: { approved: true },
            take: 1,
            include: {
              category: {
                select: { id: true, name: true },
              },
            },
          },
        },
        orderBy: { postedAt: 'asc' },
      });

      return transactions.map((tx): TransactionSummary => {
        const categorization = tx.categorizations[0];
        const amountNum = tx.amount.toNumber();
        // Determine category type from transaction amount: negative = expense, positive = income
        const categoryType: 'income' | 'expense' | 'transfer' =
          amountNum < 0 ? 'expense' : 'income';

        return {
          id: tx.id,
          postedAt: tx.postedAt.toISOString().split('T')[0],
          amount: {
            amount: Math.round(amountNum * 100), // Convert to cents for Money type
            currency: tx.currency as CurrencyCode,
            decimalPlaces: 2,
          },
          categoryId: categorization?.category.id,
          categoryName: categorization?.category.name,
          categoryType: categorization ? categoryType : undefined,
        };
      });
    },

    async getInvoicesByPeriod(
      workspaceId: UUID,
      startDate: string,
      endDate: string
    ): Promise<InvoiceSummary[]> {
      const invoices = await prisma.invoice.findMany({
        where: {
          workspaceId,
          issueDate: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
        },
        include: {
          merchant: {
            select: { name: true },
          },
        },
        orderBy: { issueDate: 'asc' },
      });

      return invoices.map((inv): InvoiceSummary => {
        const issueDate = inv.issueDate ?? new Date();
        return {
          id: inv.id,
          issueDate: issueDate.toISOString().split('T')[0],
          total: {
            amount: Math.round(inv.total.toNumber() * 100),
            currency: inv.currency as CurrencyCode,
            decimalPlaces: 2,
          },
          vatTotal: {
            amount: Math.round(inv.vatAmount.toNumber() * 100),
            currency: inv.currency as CurrencyCode,
            decimalPlaces: 2,
          },
          status: inv.status,
          merchantName: inv.merchant?.name,
        };
      });
    },

    async getLatestFxRates(baseCurrency: CurrencyCode): Promise<FxRate[]> {
      // Get the most recent rate for each currency pair
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
          rate: rate.rate.toNumber(),
          provider: rate.source, // Prisma uses 'source', domain uses 'provider'
          fetchedAt: rate.effectiveDate.toISOString(),
        })
      );
    },

    async getVatByPeriod(
      workspaceId: UUID,
      startDate: string,
      endDate: string
    ): Promise<VatEntry[]> {
      const invoices = await prisma.invoice.findMany({
        where: {
          workspaceId,
          issueDate: {
            gte: new Date(startDate),
            lte: new Date(endDate),
          },
          status: { in: ['approved', 'paid'] },
        },
        include: {
          merchant: {
            select: { name: true },
          },
        },
      });

      return invoices.map((inv): VatEntry => {
        const issueDate = inv.issueDate ?? new Date();
        const vatRate = inv.vatRate?.toNumber() ?? 0;
        return {
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber || undefined,
          issueDate: issueDate.toISOString().split('T')[0],
          vatRate,
          vatAmount: {
            amount: Math.round(inv.vatAmount.toNumber() * 100),
            currency: inv.currency as CurrencyCode,
            decimalPlaces: 2,
          },
          // Determine if this is VAT collected (sales invoice) or paid (purchase invoice)
          // For now, all invoices are expenses (VAT paid). In future, add invoice type field.
          type: 'paid' as const,
          merchantName: inv.merchant?.name,
        };
      });
    },
  };
}
