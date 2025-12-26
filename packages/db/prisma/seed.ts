import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Default expense categories for new workspaces
 */
const defaultCategories = [
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

/**
 * Create a demo workspace with default settings
 */
async function seedDemoWorkspace(): Promise<void> {
  console.log('Creating demo workspace...');

  // Create demo user (only for development/testing)
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@moneio.app' },
    update: {},
    create: {
      email: 'demo@moneio.app',
      name: 'Demo User',
    },
  });

  console.log(`Demo user created/found: ${demoUser.id}`);

  // Create demo workspace with EUR as base currency
  const demoWorkspace = await prisma.workspace.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Demo Workspace',
      baseCurrency: 'EUR',
      locale: 'en',
    },
  });

  console.log(`Demo workspace created/found: ${demoWorkspace.id}`);

  // Add user as workspace owner
  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: demoWorkspace.id,
        userId: demoUser.id,
      },
    },
    update: {},
    create: {
      workspaceId: demoWorkspace.id,
      userId: demoUser.id,
      role: 'owner',
    },
  });

  console.log('Demo user added as workspace owner');

  // Seed default categories
  await seedWorkspaceCategories(demoWorkspace.id);
}

/**
 * Main seed function
 */
async function main(): Promise<void> {
  console.log('Starting database seed...');
  console.log('');

  // Only seed demo data in development
  if (process.env.NODE_ENV !== 'production') {
    await seedDemoWorkspace();
  }

  console.log('');
  console.log('Database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

// Export for use in other parts of the application
export { defaultCategories };
