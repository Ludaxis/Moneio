import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/layout/header';
import { DashboardContent } from '@/components/dashboard/dashboard-content';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'dashboard' });
  return {
    title: `${t('title')} | Moneio`,
  };
}

export default function DashboardPage() {
  return (
    <div className="flex h-full flex-col">
      <Header title="Dashboard" />
      <div className="flex-1 overflow-auto p-6">
        <DashboardContent />
      </div>
    </div>
  );
}
