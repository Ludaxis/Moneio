import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/layout/header';
import { SettingsContent } from '@/components/settings/settings-content';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'nav' });
  return {
    title: `${t('settings')} | Moneio`,
  };
}

export default async function SettingsPage() {
  const t = await getTranslations('nav');

  return (
    <div className="flex h-full flex-col">
      <Header title={t('settings')} />
      <div className="flex-1 overflow-auto p-6">
        <SettingsContent />
      </div>
    </div>
  );
}
