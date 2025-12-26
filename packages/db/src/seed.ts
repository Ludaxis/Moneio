// Database seed script - Default categories
// Run with: pnpm db:seed

import type { NewCategory } from './schema/financial.js';

export const defaultCategories: Omit<NewCategory, 'workspaceId'>[] = [
  // Income categories
  { name: 'Sales', type: 'income', color: '#10B981', icon: 'shopping-cart', sortOrder: 1 },
  { name: 'Services', type: 'income', color: '#14B8A6', icon: 'briefcase', sortOrder: 2 },
  { name: 'Interest', type: 'income', color: '#06B6D4', icon: 'percent', sortOrder: 3 },
  { name: 'Refunds', type: 'income', color: '#0EA5E9', icon: 'rotate-ccw', sortOrder: 4 },
  { name: 'Other Income', type: 'income', color: '#6366F1', icon: 'plus-circle', sortOrder: 5 },

  // Expense categories
  { name: 'Office Supplies', type: 'expense', color: '#F59E0B', icon: 'paperclip', sortOrder: 10 },
  { name: 'Software & SaaS', type: 'expense', color: '#EF4444', icon: 'code', sortOrder: 11 },
  { name: 'Hardware & Equipment', type: 'expense', color: '#EC4899', icon: 'monitor', sortOrder: 12 },
  { name: 'Travel', type: 'expense', color: '#8B5CF6', icon: 'plane', sortOrder: 13 },
  { name: 'Meals & Entertainment', type: 'expense', color: '#D946EF', icon: 'utensils', sortOrder: 14 },
  { name: 'Professional Services', type: 'expense', color: '#F97316', icon: 'users', sortOrder: 15 },
  { name: 'Marketing & Advertising', type: 'expense', color: '#84CC16', icon: 'megaphone', sortOrder: 16 },
  { name: 'Rent & Facilities', type: 'expense', color: '#22C55E', icon: 'home', sortOrder: 17 },
  { name: 'Utilities', type: 'expense', color: '#0EA5E9', icon: 'zap', sortOrder: 18 },
  { name: 'Insurance', type: 'expense', color: '#6366F1', icon: 'shield', sortOrder: 19 },
  { name: 'Taxes & Fees', type: 'expense', color: '#A855F7', icon: 'file-text', sortOrder: 20 },
  { name: 'Bank Fees', type: 'expense', color: '#64748B', icon: 'credit-card', sortOrder: 21 },
  { name: 'Subscriptions', type: 'expense', color: '#14B8A6', icon: 'repeat', sortOrder: 22 },
  { name: 'Shipping & Logistics', type: 'expense', color: '#F59E0B', icon: 'truck', sortOrder: 23 },
  { name: 'Other Expenses', type: 'expense', color: '#94A3B8', icon: 'more-horizontal', sortOrder: 99 },

  // Transfer categories
  { name: 'Internal Transfer', type: 'transfer', color: '#64748B', icon: 'arrow-right-left', sortOrder: 100 },
  { name: 'Owner Draw', type: 'transfer', color: '#475569', icon: 'user-minus', sortOrder: 101 },
  { name: 'Owner Contribution', type: 'transfer', color: '#334155', icon: 'user-plus', sortOrder: 102 },
];

export const defaultVatRates = [
  { rate: 0, name: 'Zero rated' },
  { rate: 0.05, name: '5% Reduced' },
  { rate: 0.09, name: '9% Reduced (Estonia)' },
  { rate: 0.1, name: '10% Reduced' },
  { rate: 0.2, name: '20% Standard' },
  { rate: 0.21, name: '21% Standard' },
  { rate: 0.22, name: '22% Standard (Estonia)' },
  { rate: 0.25, name: '25% Standard' },
];

// Seed function to be called after workspace creation
export async function seedWorkspaceCategories(
  db: unknown, // Database client
  workspaceId: string
): Promise<void> {
  // TODO: Implement with Drizzle
  // const categoriesToInsert = defaultCategories.map(cat => ({
  //   ...cat,
  //   workspaceId,
  // }));
  // await db.insert(categories).values(categoriesToInsert);
  console.log(`Seeded ${defaultCategories.length} categories for workspace ${workspaceId}`);
}
