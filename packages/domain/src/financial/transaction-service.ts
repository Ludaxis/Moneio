// Transaction service
import type { BankAccount, BankTransaction, Category, Money, UUID } from '@moneio/core-ledger';

export interface TransactionRepository {
  createAccount(data: CreateBankAccountData): Promise<BankAccount>;
  findAccountById(id: UUID): Promise<BankAccount | null>;
  findAccountsByWorkspace(workspaceId: UUID): Promise<BankAccount[]>;
  updateAccount(id: UUID, data: UpdateBankAccountData): Promise<BankAccount>;
  deleteAccount(id: UUID): Promise<void>;

  createTransaction(data: CreateTransactionData): Promise<BankTransaction>;
  createTransactions(data: CreateTransactionData[]): Promise<BankTransaction[]>;
  findTransactionById(id: UUID): Promise<BankTransaction | null>;
  findTransactionsByWorkspace(
    workspaceId: UUID,
    options?: TransactionQueryOptions
  ): Promise<{ items: BankTransaction[]; total: number }>;
  updateTransaction(id: UUID, data: UpdateTransactionData): Promise<BankTransaction>;
  deleteTransaction(id: UUID): Promise<void>;

  findCategories(workspaceId: UUID): Promise<Category[]>;
}

export interface CreateBankAccountData {
  workspaceId: UUID;
  name: string;
  iban?: string;
  accountNumber?: string;
  bankName?: string;
  currency: string;
}

export interface UpdateBankAccountData {
  name?: string;
  iban?: string | null;
  accountNumber?: string | null;
  bankName?: string | null;
  isActive?: boolean;
}

export interface CreateTransactionData {
  workspaceId: UUID;
  bankAccountId: UUID;
  postedAt: string;
  descriptionRaw: string;
  amount: Money;
  counterparty?: string;
  reference?: string;
}

export interface UpdateTransactionData {
  categoryId?: UUID | null;
  documentId?: UUID | null;
  isReconciled?: boolean;
}

export interface TransactionQueryOptions {
  bankAccountId?: UUID;
  categoryId?: UUID;
  startDate?: string;
  endDate?: string;
  minAmount?: number;
  maxAmount?: number;
  isReconciled?: boolean;
  searchQuery?: string;
  limit?: number;
  offset?: number;
}

export interface CsvImportRow {
  date: string;
  description: string;
  amount: number;
  currency: string;
  reference?: string;
  counterparty?: string;
}

export class TransactionService {
  constructor(private readonly repository: TransactionRepository) {}

  // Bank Account methods
  async createBankAccount(data: CreateBankAccountData): Promise<BankAccount> {
    return this.repository.createAccount(data);
  }

  async getBankAccount(id: UUID): Promise<BankAccount | null> {
    return this.repository.findAccountById(id);
  }

  async getBankAccountsByWorkspace(workspaceId: UUID): Promise<BankAccount[]> {
    return this.repository.findAccountsByWorkspace(workspaceId);
  }

  async updateBankAccount(id: UUID, data: UpdateBankAccountData): Promise<BankAccount> {
    return this.repository.updateAccount(id, data);
  }

  async deactivateBankAccount(id: UUID): Promise<BankAccount> {
    return this.repository.updateAccount(id, { isActive: false });
  }

  // Transaction methods
  async createTransaction(data: CreateTransactionData): Promise<BankTransaction> {
    return this.repository.createTransaction(data);
  }

  async importTransactionsFromCsv(
    workspaceId: UUID,
    bankAccountId: UUID,
    rows: CsvImportRow[]
  ): Promise<{ imported: number; duplicates: number }> {
    const transactions: CreateTransactionData[] = rows.map((row) => ({
      workspaceId,
      bankAccountId,
      postedAt: new Date(row.date).toISOString(),
      descriptionRaw: row.description,
      amount: {
        amount: Math.round(row.amount * 100), // Convert to cents
        currency: row.currency as never,
        decimalPlaces: 2,
      },
      counterparty: row.counterparty,
      reference: row.reference,
    }));

    // TODO: Implement duplicate detection based on date + amount + reference
    const created = await this.repository.createTransactions(transactions);

    return {
      imported: created.length,
      duplicates: rows.length - created.length,
    };
  }

  async getTransaction(id: UUID): Promise<BankTransaction | null> {
    return this.repository.findTransactionById(id);
  }

  async getTransactionsByWorkspace(
    workspaceId: UUID,
    options?: TransactionQueryOptions
  ): Promise<{ items: BankTransaction[]; total: number }> {
    return this.repository.findTransactionsByWorkspace(workspaceId, options);
  }

  async categorizeTransaction(transactionId: UUID, categoryId: UUID): Promise<BankTransaction> {
    return this.repository.updateTransaction(transactionId, { categoryId });
  }

  async reconcileTransaction(transactionId: UUID): Promise<BankTransaction> {
    return this.repository.updateTransaction(transactionId, { isReconciled: true });
  }

  async linkTransactionToDocument(transactionId: UUID, documentId: UUID): Promise<BankTransaction> {
    return this.repository.updateTransaction(transactionId, { documentId });
  }

  // Category methods
  async getCategories(workspaceId: UUID): Promise<Category[]> {
    return this.repository.findCategories(workspaceId);
  }

  // Bulk operations
  async bulkCategorize(transactionIds: UUID[], categoryId: UUID): Promise<number> {
    let count = 0;
    for (const id of transactionIds) {
      await this.repository.updateTransaction(id, { categoryId });
      count++;
    }
    return count;
  }

  async bulkReconcile(transactionIds: UUID[]): Promise<number> {
    let count = 0;
    for (const id of transactionIds) {
      await this.repository.updateTransaction(id, { isReconciled: true });
      count++;
    }
    return count;
  }
}
