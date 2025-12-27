// Invoice-to-Transaction matching service
import type {
  BankTransaction,
  Invoice,
  Match,
  MatchStatus,
  MatchType,
  UUID,
} from '@moneio/core-ledger';
import { toDecimal } from '@moneio/core-ledger';

export interface MatchRepository {
  create(data: CreateMatchData): Promise<Match>;
  findById(id: UUID): Promise<Match | null>;
  findByWorkspace(
    workspaceId: UUID,
    options?: MatchQueryOptions
  ): Promise<{ items: Match[]; total: number }>;
  findByInvoice(invoiceId: UUID): Promise<Match[]>;
  findByTransaction(transactionId: UUID): Promise<Match[]>;
  updateStatus(id: UUID, status: MatchStatus): Promise<Match>;
  delete(id: UUID): Promise<void>;
}

export interface CreateMatchData {
  workspaceId: UUID;
  invoiceId: UUID;
  transactionId: UUID;
  matchType: MatchType;
  confidence?: number;
  notes?: string;
}

export interface MatchQueryOptions {
  status?: MatchStatus;
  matchType?: MatchType;
  limit?: number;
  offset?: number;
}

export interface MatchSuggestion {
  invoiceId: UUID;
  transactionId: UUID;
  matchType: MatchType;
  confidence: number;
  reasons: string[];
}

export class MatchingService {
  constructor(private readonly repository: MatchRepository) {}

  async createMatch(data: CreateMatchData): Promise<Match> {
    return this.repository.create({
      ...data,
      matchType: data.matchType || 'suggested',
    });
  }

  async getMatch(id: UUID): Promise<Match | null> {
    return this.repository.findById(id);
  }

  async getMatchesByWorkspace(
    workspaceId: UUID,
    options?: MatchQueryOptions
  ): Promise<{ items: Match[]; total: number }> {
    return this.repository.findByWorkspace(workspaceId, options);
  }

  async approveMatch(id: UUID): Promise<Match> {
    return this.repository.updateStatus(id, 'approved');
  }

  async rejectMatch(id: UUID): Promise<Match> {
    return this.repository.updateStatus(id, 'rejected');
  }

  async deleteMatch(id: UUID): Promise<void> {
    return this.repository.delete(id);
  }

  /**
   * Find potential matches between an invoice and a list of transactions
   */
  findPotentialMatches(
    invoice: Invoice,
    transactions: BankTransaction[],
    options?: { tolerancePercentage?: number; dateRangeDays?: number }
  ): MatchSuggestion[] {
    const tolerancePercentage = options?.tolerancePercentage ?? 5;
    const dateRangeDays = options?.dateRangeDays ?? 30;

    const invoiceTotal = toDecimal(invoice.total);
    const suggestions: MatchSuggestion[] = [];

    for (const tx of transactions) {
      const txAmount = Math.abs(toDecimal(tx.amount));
      const reasons: string[] = [];
      let confidence = 0;

      // Check amount match
      const amountDiff = Math.abs(invoiceTotal - txAmount);
      const amountDiffPercent = (amountDiff / invoiceTotal) * 100;

      if (amountDiffPercent === 0) {
        reasons.push('Exact amount match');
        confidence += 50;
      } else if (amountDiffPercent <= tolerancePercentage) {
        reasons.push(`Amount within ${tolerancePercentage}% tolerance`);
        confidence += 30;
      } else {
        continue; // Skip if amount doesn't match
      }

      // Check date proximity
      if (invoice.issueDate) {
        const invoiceDate = new Date(invoice.issueDate);
        const txDate = new Date(tx.postedAt);
        const daysDiff = Math.abs(
          (txDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysDiff <= 7) {
          reasons.push('Transaction within 7 days of invoice');
          confidence += 25;
        } else if (daysDiff <= dateRangeDays) {
          reasons.push(`Transaction within ${dateRangeDays} days`);
          confidence += 15;
        }
      }

      // Check reference match
      if (invoice.invoiceNumber && tx.reference) {
        if (tx.reference.includes(invoice.invoiceNumber)) {
          reasons.push('Reference contains invoice number');
          confidence += 25;
        }
      }

      // Check currency match
      if (invoice.total.currency === tx.amount.currency) {
        confidence += 10;
      }

      // Determine match type
      let matchType: MatchType;
      if (confidence >= 80) {
        matchType = 'exact';
      } else if (confidence >= 50) {
        matchType = 'partial';
      } else {
        matchType = 'suggested';
      }

      if (confidence >= 40) {
        suggestions.push({
          invoiceId: invoice.id,
          transactionId: tx.id,
          matchType,
          confidence: Math.min(confidence, 100),
          reasons,
        });
      }
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Automatically create match suggestions for unmatched invoices
   */
  async suggestMatchesForInvoice(
    workspaceId: UUID,
    invoice: Invoice,
    transactions: BankTransaction[]
  ): Promise<Match[]> {
    const suggestions = this.findPotentialMatches(invoice, transactions);
    const matches: Match[] = [];

    for (const suggestion of suggestions) {
      // Check if match already exists
      const existing = await this.repository.findByInvoice(invoice.id);
      const alreadyMatched = existing.some((m) => m.transactionId === suggestion.transactionId);

      if (!alreadyMatched) {
        const match = await this.repository.create({
          workspaceId,
          invoiceId: suggestion.invoiceId,
          transactionId: suggestion.transactionId,
          matchType: suggestion.matchType,
          confidence: suggestion.confidence,
          notes: suggestion.reasons.join('; '),
        });
        matches.push(match);
      }
    }

    return matches;
  }

  /**
   * Get match statistics for a workspace
   */
  async getMatchStats(workspaceId: UUID): Promise<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    approvalRate: number;
  }> {
    const { items: allMatches } = await this.repository.findByWorkspace(workspaceId, {
      limit: 10000,
    });

    const pending = allMatches.filter((m) => m.status === 'suggested').length;
    const approved = allMatches.filter((m) => m.status === 'approved').length;
    const rejected = allMatches.filter((m) => m.status === 'rejected').length;
    const reviewed = approved + rejected;

    return {
      total: allMatches.length,
      pending,
      approved,
      rejected,
      approvalRate: reviewed > 0 ? (approved / reviewed) * 100 : 0,
    };
  }
}
