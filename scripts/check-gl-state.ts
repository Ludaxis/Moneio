import { prisma } from '../packages/db/src/client';

async function check() {
  // Get workspaces
  const workspaces = await prisma.workspace.findMany({
    select: { id: true, name: true },
  });
  console.log('Workspaces:', JSON.stringify(workspaces, null, 2));

  for (const ws of workspaces) {
    // Check GL accounts
    const glAccounts = await prisma.gLAccount.count({ where: { workspaceId: ws.id } });
    console.log(`\nWorkspace ${ws.name} (${ws.id}):`);
    console.log(`  GL Accounts: ${glAccounts}`);

    // Check categories with GL mapping
    const categoriesWithGL = await prisma.category.count({
      where: { workspaceId: ws.id, glAccountId: { not: null } },
    });
    const totalCategories = await prisma.category.count({
      where: { workspaceId: ws.id },
    });
    console.log(`  Categories: ${categoriesWithGL}/${totalCategories} have GL mapping`);

    // Check bank accounts with GL mapping
    const bankAccountsWithGL = await prisma.bankAccount.count({
      where: { workspaceId: ws.id, glAccountId: { not: null } },
    });
    const totalBankAccounts = await prisma.bankAccount.count({
      where: { workspaceId: ws.id },
    });
    console.log(`  Bank Accounts: ${bankAccountsWithGL}/${totalBankAccounts} have GL mapping`);

    // Check journal entries
    const journalEntries = await prisma.journalEntry.count({
      where: { workspaceId: ws.id },
    });
    console.log(`  Journal Entries: ${journalEntries}`);

    // Check approved categorizations
    const approvedCats = await prisma.transactionCategorization.count({
      where: { workspaceId: ws.id, approved: true },
    });
    console.log(`  Approved Categorizations: ${approvedCats}`);
  }

  await prisma.$disconnect();
}

check().catch(console.error);
