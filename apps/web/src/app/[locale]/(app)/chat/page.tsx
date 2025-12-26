import { getTranslations } from 'next-intl/server';
import { Header } from '@/components/layout/header';
import { ChatContent } from '@/components/chat/chat-content';

export async function generateMetadata({ params: { locale } }: { params: { locale: string } }) {
  const t = await getTranslations({ locale, namespace: 'chat' });
  return {
    title: `${t('title')} | Moneio`,
  };
}

export default async function ChatPage() {
  const t = await getTranslations('chat');

  return (
    <div className="flex h-full flex-col">
      <Header title={t('title')} />
      <div className="flex-1 overflow-hidden">
        <ChatContent />
      </div>
    </div>
  );
}
