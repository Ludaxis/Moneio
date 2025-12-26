import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/layout/header';
import { DocumentsContent } from '@/components/documents/documents-content';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'documents' });
  return {
    title: `${t('title')} | Moneio`,
  };
}

export default async function DocumentsPage() {
  const t = await getTranslations('documents');

  return (
    <div className="flex h-full flex-col">
      <Header title={t('title')} />
      <div className="flex-1 overflow-auto p-6">
        <DocumentsContent />
      </div>
    </div>
  );
}
