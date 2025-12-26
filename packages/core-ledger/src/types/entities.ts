// Financial entities

import type { EntityBase, UUID, WorkspaceRole } from './common.js';
import type { CurrencyCode, Money } from './money.js';

// User and Workspace
export interface User {
  id: UUID;
  email: string;
  name?: string;
  avatarUrl?: string;
  createdAt: string;
}

export interface Workspace extends EntityBase {
  name: string;
  baseCurrency: CurrencyCode;
  settings?: WorkspaceSettings;
}

export interface WorkspaceSettings {
  defaultVatRate?: number;
  fiscalYearStart?: string; // MM-DD format
  timezone?: string;
}

export interface WorkspaceMember {
  userId: UUID;
  workspaceId: UUID;
  role: WorkspaceRole;
  joinedAt: string;
}

// Merchants
export interface Merchant extends EntityBase {
  nameNormalized: string;
  displayName?: string;
  country?: string;
  vatId?: string;
  category?: string;
  metadata?: Record<string, unknown>;
}

// Invoices
export type InvoiceStatus = 'draft' | 'approved' | 'paid' | 'void';

export interface Invoice extends EntityBase {
  documentId?: UUID;
  merchantId?: UUID;
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  currency: CurrencyCode;
  subtotal: Money;
  vatTotal: Money;
  total: Money;
  status: InvoiceStatus;
  notes?: string;
}

export interface InvoiceLineItem {
  id: UUID;
  invoiceId: UUID;
  description: string;
  quantity: number;
  unitPrice: Money;
  vatRate: number;
  lineTotal: Money;
  sortOrder: number;
}

// Bank Accounts
export interface BankAccount extends EntityBase {
  name: string;
  iban?: string;
  accountNumber?: string;
  bankName?: string;
  currency: CurrencyCode;
  isActive: boolean;
  metadata?: Record<string, unknown>;
}

// Bank Transactions
export interface BankTransaction extends EntityBase {
  bankAccountId: UUID;
  postedAt: string;
  descriptionRaw: string;
  amount: Money;
  counterparty?: string;
  reference?: string;
  documentId?: UUID;
  categoryId?: UUID;
  isReconciled: boolean;
  metadata?: Record<string, unknown>;
}

// Categories
export type CategoryType = 'income' | 'expense' | 'transfer';

export interface Category extends EntityBase {
  name: string;
  type: CategoryType;
  parentId?: UUID;
  color?: string;
  icon?: string;
  sortOrder: number;
}

export interface CategoryTreeNode extends Category {
  children: CategoryTreeNode[];
}
