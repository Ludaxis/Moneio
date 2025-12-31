/**
 * General Ledger Detail Report Service
 *
 * Generates detailed GL reports showing all transactions by account.
 * Includes running balances and supports filtering.
 */

import type { CurrencyCode, UUID } from '@moneio/core-ledger';
import { createMoney } from '@moneio/core-ledger';

import type { ReportRepository, GLAccountData } from './repository';
import type {
  AccountType,
  GeneralLedgerReport,
  GLAccountDetail,
  GLDetailEntry,
  GLDetailInput,
  ReportMetadata,
} from './types';

export class GLDetailService {
  constructor(private readonly repository: ReportRepository) {}

  async generate(input: GLDetailInput): Promise<GeneralLedgerReport> {
    const { workspaceId, startDate, endDate, baseCurrency, accountIds, accountTypes } = input;

    // Fetch all accounts
    let accounts = await this.repository.getGLAccounts(workspaceId);

    // Apply filters
    if (accountIds && accountIds.length > 0) {
      const accountIdSet = new Set(accountIds);
      accounts = accounts.filter((a) => accountIdSet.has(a.id));
    }

    if (accountTypes && accountTypes.length > 0) {
      accounts = accounts.filter((a) => accountTypes.includes(a.accountType as AccountType));
    }

    // Sort by account code
    accounts.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    // Fetch journal lines and opening balances for each account
    const accountDetails: GLAccountDetail[] = await Promise.all(
      accounts.map((account) => this.buildAccountDetail(
        workspaceId,
        account,
        startDate,
        endDate,
        baseCurrency
      ))
    );

    // Filter out accounts with no activity if not requested
    const activeAccounts = accountDetails.filter(
      (detail) => detail.entries.length > 0 || detail.openingBalance.amount !== 0
    );

    // Calculate summary
    const totalDebits = createMoney(
      activeAccounts.reduce((sum, a) => sum + a.totalDebits.amount, 0),
      baseCurrency
    );
    const totalCredits = createMoney(
      activeAccounts.reduce((sum, a) => sum + a.totalCredits.amount, 0),
      baseCurrency
    );
    const entryCount = activeAccounts.reduce((sum, a) => sum + a.entries.length, 0);

    const metadata: ReportMetadata = {
      generatedAt: new Date().toISOString(),
      workspaceId,
      baseCurrency,
      period: { start: startDate, end: endDate },
    };

    return {
      metadata,
      accounts: activeAccounts,
      summary: {
        totalDebits,
        totalCredits,
        accountCount: activeAccounts.length,
        entryCount,
      },
    };
  }

  private async buildAccountDetail(
    workspaceId: UUID,
    account: GLAccountData,
    startDate: string,
    endDate: string,
    baseCurrency: CurrencyCode
  ): Promise<GLAccountDetail> {
    // Fetch opening balance and journal lines in parallel
    const [openingBalanceAmount, journalLines] = await Promise.all([
      this.repository.getOpeningBalance(workspaceId, account.id, startDate),
      this.repository.getJournalLinesForAccount(workspaceId, account.id, startDate, endDate),
    ]);

    const openingBalance = createMoney(openingBalanceAmount, baseCurrency);

    // Sort journal lines by date and entry number
    journalLines.sort((a, b) => {
      const dateCompare = a.entryDate.localeCompare(b.entryDate);
      if (dateCompare !== 0) return dateCompare;
      return a.entryNumber.localeCompare(b.entryNumber);
    });

    // Build entries with running balance
    let runningBalance = openingBalanceAmount;
    const entries: GLDetailEntry[] = journalLines.map((line): GLDetailEntry => {
      // Calculate balance change based on normal balance
      const change = account.normalBalance === 'DEBIT'
        ? line.debitAmount - line.creditAmount
        : line.creditAmount - line.debitAmount;

      runningBalance += change;

      return {
        entryId: line.entryId,
        entryNumber: line.entryNumber,
        entryDate: line.entryDate,
        description: line.description,
        referenceType: line.referenceType,
        referenceId: line.referenceId,
        debit: createMoney(line.debitAmount, baseCurrency),
        credit: createMoney(line.creditAmount, baseCurrency),
        runningBalance: createMoney(runningBalance, baseCurrency),
      };
    });

    // Calculate totals
    const totalDebits = createMoney(
      journalLines.reduce((sum, line) => sum + line.debitAmount, 0),
      baseCurrency
    );
    const totalCredits = createMoney(
      journalLines.reduce((sum, line) => sum + line.creditAmount, 0),
      baseCurrency
    );
    const closingBalance = createMoney(runningBalance, baseCurrency);

    return {
      accountId: account.id,
      accountCode: account.accountCode,
      accountName: account.accountName,
      accountType: account.accountType as AccountType,
      openingBalance,
      entries,
      totalDebits,
      totalCredits,
      closingBalance,
    };
  }
}
