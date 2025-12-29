/**
 * Plaid Service
 *
 * Handles Plaid Link flow and transaction synchronization:
 * 1. Create link token for Plaid Link initialization
 * 2. Exchange public token for access token after user connects
 * 3. Sync transactions from connected accounts
 */

import crypto from 'crypto';

import type { PrismaClient } from '@prisma/client';
import { CountryCode, Products, type Transaction as PlaidTransaction } from 'plaid';

import { plaidClient, isPlaidConfigured } from './client';

export interface PlaidServiceConfig {
  prisma: PrismaClient;
}

export class PlaidService {
  private prisma: PrismaClient;

  constructor(config: PlaidServiceConfig) {
    this.prisma = config.prisma;
  }

  /**
   * Create a link token for Plaid Link initialization
   */
  async createLinkToken(
    userId: string,
    _workspaceId: string,
    redirectUri?: string
  ): Promise<{ linkToken: string; expiration: string }> {
    if (!isPlaidConfigured()) {
      throw new Error('Plaid is not configured');
    }

    const response = await plaidClient.linkTokenCreate({
      user: {
        client_user_id: userId,
      },
      client_name: 'Moneio',
      products: [Products.Transactions],
      country_codes: [
        CountryCode.Us,
        CountryCode.Ca,
        CountryCode.Gb,
        CountryCode.Nl,
        CountryCode.De,
      ],
      language: 'en',
      redirect_uri: redirectUri,
      // Optional: webhook URL for real-time updates
      // webhook: process.env.PLAID_WEBHOOK_URL,
    });

    return {
      linkToken: response.data.link_token,
      expiration: response.data.expiration,
    };
  }

  /**
   * Exchange public token for access token and save item
   */
  async exchangePublicToken(
    workspaceId: string,
    publicToken: string,
    metadata?: {
      institutionId?: string;
      institutionName?: string;
    }
  ): Promise<{ itemId: string; accountCount: number }> {
    if (!isPlaidConfigured()) {
      throw new Error('Plaid is not configured');
    }

    // Exchange public token for access token
    const exchangeResponse = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken,
    });

    const { access_token: accessToken, item_id: itemId } = exchangeResponse.data;

    // Get account information
    const accountsResponse = await plaidClient.accountsGet({
      access_token: accessToken,
    });

    const accounts = accountsResponse.data.accounts;

    // Create PlaidItem and BankAccounts in a transaction
    await this.prisma.$transaction(async (tx) => {
      // Create PlaidItem
      const plaidItem = await tx.plaidItem.create({
        data: {
          workspaceId,
          itemId,
          accessToken, // In production, encrypt this
          institutionId: metadata?.institutionId,
          institutionName: metadata?.institutionName,
          status: 'active',
        },
      });

      // Create BankAccounts for each Plaid account
      for (const account of accounts) {
        await tx.bankAccount.create({
          data: {
            workspaceId,
            plaidItemId: plaidItem.id,
            plaidAccountId: account.account_id,
            name: account.name,
            officialName: account.official_name,
            mask: account.mask,
            type: account.type,
            subtype: account.subtype || undefined,
            currency: account.balances.iso_currency_code || 'USD',
            currentBalance: account.balances.current
              ? parseFloat(account.balances.current.toString())
              : undefined,
            availableBalance: account.balances.available
              ? parseFloat(account.balances.available.toString())
              : undefined,
            isManual: false,
          },
        });
      }
    });

    return {
      itemId,
      accountCount: accounts.length,
    };
  }

  /**
   * Sync transactions for a PlaidItem
   * Uses cursor-based pagination for incremental sync
   */
  async syncTransactions(
    plaidItemId: string
  ): Promise<{ added: number; modified: number; removed: number }> {
    if (!isPlaidConfigured()) {
      throw new Error('Plaid is not configured');
    }

    // Get PlaidItem with accounts
    const plaidItem = await this.prisma.plaidItem.findUnique({
      where: { id: plaidItemId },
      include: { bankAccounts: true },
    });

    if (!plaidItem) {
      throw new Error('PlaidItem not found');
    }

    // Build account ID to bank account ID mapping
    const accountMap = new Map<string, string>();
    for (const account of plaidItem.bankAccounts) {
      if (account.plaidAccountId) {
        accountMap.set(account.plaidAccountId, account.id);
      }
    }

    let cursor = plaidItem.cursor || undefined;
    let hasMore = true;
    let addedCount = 0;
    let modifiedCount = 0;
    let removedCount = 0;

    while (hasMore) {
      const response = await plaidClient.transactionsSync({
        access_token: plaidItem.accessToken,
        cursor,
        count: 500,
      });

      const { added, modified, removed, next_cursor, has_more } = response.data;

      // Process added transactions
      for (const tx of added) {
        const bankAccountId = accountMap.get(tx.account_id);
        if (!bankAccountId) continue;

        await this.upsertTransaction(plaidItem.workspaceId, bankAccountId, tx);
        addedCount++;
      }

      // Process modified transactions
      for (const tx of modified) {
        const bankAccountId = accountMap.get(tx.account_id);
        if (!bankAccountId) continue;

        await this.upsertTransaction(plaidItem.workspaceId, bankAccountId, tx);
        modifiedCount++;
      }

      // Process removed transactions
      for (const removedTx of removed) {
        await this.prisma.bankTransaction.deleteMany({
          where: { plaidTransactionId: removedTx.transaction_id },
        });
        removedCount++;
      }

      cursor = next_cursor;
      hasMore = has_more;
    }

    // Update cursor and last synced time
    await this.prisma.plaidItem.update({
      where: { id: plaidItemId },
      data: {
        cursor,
        lastSyncedAt: new Date(),
      },
    });

    return { added: addedCount, modified: modifiedCount, removed: removedCount };
  }

  /**
   * Upsert a transaction from Plaid
   */
  private async upsertTransaction(
    workspaceId: string,
    bankAccountId: string,
    tx: PlaidTransaction
  ): Promise<void> {
    // Plaid amounts are positive for debits, negative for credits
    // We store expenses as negative, income as positive
    const amount = -tx.amount;

    const txHash = this.generateTxHash(tx);

    await this.prisma.bankTransaction.upsert({
      where: { plaidTransactionId: tx.transaction_id },
      create: {
        workspaceId,
        bankAccountId,
        plaidTransactionId: tx.transaction_id,
        txHash,
        postedAt: new Date(tx.date),
        description: tx.name,
        merchantName: tx.merchant_name,
        pending: tx.pending,
        amount,
        currency: tx.iso_currency_code || 'USD',
        rawData: tx as unknown as object,
      },
      update: {
        description: tx.name,
        merchantName: tx.merchant_name,
        pending: tx.pending,
        amount,
        rawData: tx as unknown as object,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Generate a unique hash for a transaction
   */
  private generateTxHash(tx: PlaidTransaction): string {
    const data = `${tx.account_id}-${tx.date}-${tx.amount}-${tx.name}`;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32);
  }

  /**
   * Update account balances
   */
  async updateBalances(plaidItemId: string): Promise<void> {
    if (!isPlaidConfigured()) {
      throw new Error('Plaid is not configured');
    }

    const plaidItem = await this.prisma.plaidItem.findUnique({
      where: { id: plaidItemId },
      include: { bankAccounts: true },
    });

    if (!plaidItem) {
      throw new Error('PlaidItem not found');
    }

    const response = await plaidClient.accountsGet({
      access_token: plaidItem.accessToken,
    });

    for (const account of response.data.accounts) {
      const bankAccount = plaidItem.bankAccounts.find(
        (ba) => ba.plaidAccountId === account.account_id
      );

      if (bankAccount) {
        await this.prisma.bankAccount.update({
          where: { id: bankAccount.id },
          data: {
            currentBalance: account.balances.current
              ? parseFloat(account.balances.current.toString())
              : undefined,
            availableBalance: account.balances.available
              ? parseFloat(account.balances.available.toString())
              : undefined,
          },
        });
      }
    }
  }

  /**
   * Remove a Plaid item (disconnect bank)
   */
  async removeItem(plaidItemId: string): Promise<void> {
    const plaidItem = await this.prisma.plaidItem.findUnique({
      where: { id: plaidItemId },
    });

    if (!plaidItem) {
      throw new Error('PlaidItem not found');
    }

    // Remove item from Plaid
    if (isPlaidConfigured()) {
      try {
        await plaidClient.itemRemove({
          access_token: plaidItem.accessToken,
        });
      } catch (error) {
        // Log but don't fail if Plaid removal fails
        console.error('Failed to remove item from Plaid:', error);
      }
    }

    // Delete from database (cascades to bank accounts)
    await this.prisma.plaidItem.delete({
      where: { id: plaidItemId },
    });
  }

  /**
   * Get all connected items for a workspace
   */
  async getItems(workspaceId: string) {
    return this.prisma.plaidItem.findMany({
      where: { workspaceId },
      include: {
        bankAccounts: {
          select: {
            id: true,
            name: true,
            officialName: true,
            mask: true,
            type: true,
            subtype: true,
            currency: true,
            currentBalance: true,
            availableBalance: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
