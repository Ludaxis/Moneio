import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/layout/header';
import { InvoicesContent } from '@/components/invoices/invoices-content';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'invoices' });
  return {
    title: `${t('title')} | Moneio`,
  };
}

export default async function InvoicesPage() {
  const t = await getTranslations('invoices');

  return (
    <div className="flex h-full flex-col">
      <Header title={t('title')} />
      <div className="flex-1 overflow-auto p-6">
        <InvoicesContent />
      </div>
    </div>
  );
}
