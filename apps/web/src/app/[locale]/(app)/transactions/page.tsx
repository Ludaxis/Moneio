import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/layout/header';
import { TransactionsContent } from '@/components/transactions/transactions-content';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'transactions' });
  return {
    title: `${t('title')} | Moneio`,
  };
}

export default async function TransactionsPage() {
  const t = await getTranslations('transactions');

  return (
    <div className="flex h-full flex-col">
      <Header title={t('title')} />
      <div className="flex-1 overflow-auto p-6">
        <TransactionsContent />
      </div>
    </div>
  );
}
