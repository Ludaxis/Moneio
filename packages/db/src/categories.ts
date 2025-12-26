// Category utilities for workspace setup
import { prisma } from './client';

/**
 * Default expense categories for new workspaces
 */
export const defaultCategories = [
  // Income categories
  { name: 'Sales Revenue', taxCode: 'INCOME', isSystem: true },
  { name: 'Service Revenue', taxCode: 'INCOME', isSystem: true },
  { name: 'Interest Income', taxCode: 'INCOME', isSystem: true },
  { name: 'Other Income', taxCode: 'INCOME', isSystem: true },

  // Cost of Goods Sold
  { name: 'Cost of Goods Sold', taxCode: 'COGS', isSystem: true },
  { name: 'Inventory', taxCode: 'COGS', isSystem: true },

  // Operating Expenses
  { name: 'Salaries & Wages', taxCode: 'OPEX', isSystem: true },
  { name: 'Rent', taxCode: 'OPEX', isSystem: true },
  { name: 'Utilities', taxCode: 'OPEX', isSystem: true },
  { name: 'Office Supplies', taxCode: 'OPEX', isSystem: true },
  { name: 'Professional Services', taxCode: 'OPEX', isSystem: true },
  { name: 'Insurance', taxCode: 'OPEX', isSystem: true },
  { name: 'Marketing & Advertising', taxCode: 'OPEX', isSystem: true },
  { name: 'Travel & Entertainment', taxCode: 'OPEX', isSystem: true },
  { name: 'Software & Subscriptions', taxCode: 'OPEX', isSystem: true },
  { name: 'Bank Fees', taxCode: 'OPEX', isSystem: true },
  { name: 'Depreciation', taxCode: 'OPEX', isSystem: true },
  { name: 'Repairs & Maintenance', taxCode: 'OPEX', isSystem: true },
  { name: 'Shipping & Delivery', taxCode: 'OPEX', isSystem: true },
  { name: 'Telecommunications', taxCode: 'OPEX', isSystem: true },
  { name: 'Training & Education', taxCode: 'OPEX', isSystem: true },
  { name: 'Legal & Compliance', taxCode: 'OPEX', isSystem: true },

  // Tax-related
  { name: 'Tax Payments', taxCode: 'TAX', isSystem: true },
  { name: 'VAT Payable', taxCode: 'TAX', isSystem: true },

  // Transfers
  { name: 'Owner Draw', taxCode: 'EQUITY', isSystem: true },
  { name: 'Owner Investment', taxCode: 'EQUITY', isSystem: true },
  { name: 'Internal Transfer', taxCode: 'TRANSFER', isSystem: true },

  // Catch-all
  { name: 'Uncategorized', taxCode: null, isSystem: true },
];

/**
 * Seed default categories for a workspace
 */
export async function seedWorkspaceCategories(workspaceId: string): Promise<void> {
  console.log(`Seeding categories for workspace: ${workspaceId}`);

  for (const category of defaultCategories) {
    await prisma.category.upsert({
      where: {
        workspaceId_name: {
          workspaceId,
          name: category.name,
        },
      },
      update: {},
      create: {
        workspaceId,
        name: category.name,
        taxCode: category.taxCode,
        isSystem: category.isSystem,
      },
    });
  }

  console.log(`Seeded ${defaultCategories.length} categories`);
}
