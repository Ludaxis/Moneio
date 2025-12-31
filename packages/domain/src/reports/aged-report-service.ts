/**
 * Aged Receivables/Payables Report Service
 *
 * Generates aging reports for tracking overdue invoices and bills.
 * Supports configurable aging buckets.
 */

import type { CurrencyCode, Money } from '@moneio/core-ledger';
import { createMoney } from '@moneio/core-ledger';

import { daysBetween, getBucketForDays } from './repository';
import type { ReportRepository, InvoiceData } from './repository';
import type {
  AgedReport,
  AgedReportInput,
  AgingBucket,
  AgingByCounterparty,
  AgingItem,
  ReportMetadata,
} from './types';

export class AgedReportService {
  constructor(private readonly repository: ReportRepository) {}

  async generate(input: AgedReportInput): Promise<AgedReport> {
    const { workspaceId, asOfDate, baseCurrency, type, buckets } = input;

    // Use default buckets if not provided
    const agingBuckets: AgingBucket[] = buckets || [
      { label: 'Current', minDays: 0, maxDays: 0 },
      { label: '1-30 Days', minDays: 1, maxDays: 30 },
      { label: '31-60 Days', minDays: 31, maxDays: 60 },
      { label: '61-90 Days', minDays: 61, maxDays: 90 },
      { label: '90+ Days', minDays: 91, maxDays: null },
    ];

    // Fetch outstanding invoices
    const invoices = await this.repository.getOutstandingInvoices(workspaceId, asOfDate, type);

    // Transform to aging items
    const agingItems = this.transformToAgingItems(invoices, asOfDate, agingBuckets, baseCurrency);

    // Group by counterparty
    const byCounterparty = this.groupByCounterparty(agingItems, agingBuckets, baseCurrency);

    // Calculate bucket summary
    const bucketSummary = this.calculateBucketSummary(agingItems, agingBuckets, baseCurrency);

    // Calculate totals
    const totalOutstanding = createMoney(
      agingItems.reduce((sum, item) => sum + item.outstandingAmount.amount, 0),
      baseCurrency
    );

    const overdueItems = agingItems.filter((item) => item.daysOverdue > 0);
    const totalOverdue = createMoney(
      overdueItems.reduce((sum, item) => sum + item.outstandingAmount.amount, 0),
      baseCurrency
    );

    const overduePercentage =
      totalOutstanding.amount > 0 ? (totalOverdue.amount / totalOutstanding.amount) * 100 : 0;

    const averageDaysOutstanding =
      agingItems.length > 0
        ? Math.round(
            agingItems.reduce((sum, item) => sum + Math.max(0, item.daysOverdue), 0) /
              agingItems.length
          )
        : 0;

    const metadata: ReportMetadata = {
      generatedAt: new Date().toISOString(),
      workspaceId,
      baseCurrency,
      period: { start: asOfDate, end: asOfDate },
    };

    return {
      metadata,
      type,
      asOfDate,
      buckets: agingBuckets,
      byCounterparty,
      bucketSummary,
      totalOutstanding,
      totalOverdue,
      overduePercentage: Math.round(overduePercentage * 10) / 10,
      averageDaysOutstanding,
    };
  }

  private transformToAgingItems(
    invoices: InvoiceData[],
    asOfDate: string,
    buckets: AgingBucket[],
    _baseCurrency: CurrencyCode
  ): AgingItem[] {
    return invoices.map((invoice): AgingItem => {
      const outstanding = invoice.total - invoice.paidAmount;
      const dueDate = invoice.dueDate || invoice.issueDate;
      const daysOverdue = daysBetween(dueDate, asOfDate);
      const bucket = daysOverdue <= 0 ? 'Current' : getBucketForDays(daysOverdue, buckets);

      return {
        id: invoice.id,
        documentNumber: invoice.invoiceNumber || `INV-${invoice.id.substring(0, 8)}`,
        counterpartyId: invoice.merchantId,
        counterpartyName: invoice.merchantName || 'Unknown',
        issueDate: invoice.issueDate,
        dueDate,
        originalAmount: createMoney(invoice.total, invoice.currency),
        outstandingAmount: createMoney(outstanding, invoice.currency),
        daysOverdue: Math.max(0, daysOverdue),
        bucket,
      };
    });
  }

  private groupByCounterparty(
    items: AgingItem[],
    buckets: AgingBucket[],
    baseCurrency: CurrencyCode
  ): AgingByCounterparty[] {
    const grouped = new Map<string, AgingItem[]>();

    for (const item of items) {
      const key = item.counterpartyId || item.counterpartyName;
      const existing = grouped.get(key) || [];
      existing.push(item);
      grouped.set(key, existing);
    }

    return Array.from(grouped.entries())
      .map(([_key, counterpartyItems]): AgingByCounterparty => {
        const bucketTotals: Record<string, Money> = {};

        // Initialize all buckets to zero
        for (const bucket of buckets) {
          bucketTotals[bucket.label] = createMoney(0, baseCurrency);
        }

        // Sum items into buckets
        for (const item of counterpartyItems) {
          const bucketAmount = bucketTotals[item.bucket];
          if (bucketAmount) {
            bucketTotals[item.bucket] = createMoney(
              bucketAmount.amount + item.outstandingAmount.amount,
              baseCurrency
            );
          }
        }

        const totalOutstanding = createMoney(
          counterpartyItems.reduce((sum, item) => sum + item.outstandingAmount.amount, 0),
          baseCurrency
        );

        return {
          counterpartyId: counterpartyItems[0].counterpartyId,
          counterpartyName: counterpartyItems[0].counterpartyName,
          items: counterpartyItems.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
          bucketTotals,
          totalOutstanding,
        };
      })
      .sort((a, b) => b.totalOutstanding.amount - a.totalOutstanding.amount);
  }

  private calculateBucketSummary(
    items: AgingItem[],
    buckets: AgingBucket[],
    baseCurrency: CurrencyCode
  ): Record<string, Money> {
    const summary: Record<string, Money> = {};

    // Initialize all buckets to zero
    for (const bucket of buckets) {
      summary[bucket.label] = createMoney(0, baseCurrency);
    }

    // Sum items into buckets
    for (const item of items) {
      const bucketAmount = summary[item.bucket];
      if (bucketAmount) {
        summary[item.bucket] = createMoney(
          bucketAmount.amount + item.outstandingAmount.amount,
          baseCurrency
        );
      }
    }

    return summary;
  }
}
