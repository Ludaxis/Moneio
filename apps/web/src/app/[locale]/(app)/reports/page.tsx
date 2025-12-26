import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/layout/header';
import { ReportsContent } from '@/components/reports/reports-content';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'reports' });
  return {
    title: `${t('title')} | Moneio`,
  };
}

export default async function ReportsPage() {
  const t = await getTranslations('reports');

  return (
    <div className="flex h-full flex-col">
      <Header title={t('title')} />
      <div className="flex-1 overflow-auto p-6">
        <ReportsContent />
      </div>
    </div>
  );
}
