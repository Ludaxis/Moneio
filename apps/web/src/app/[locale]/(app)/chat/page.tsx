'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function ChatPage() {
  const tNav = useTranslations('navigation');
  const tCommon = useTranslations('common');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">{tNav('chat')}</h1>
        <Link href="/" className="text-sm text-primary hover:underline">
          {tCommon('back')}
        </Link>
      </div>
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        AI chat is coming soon. Connect your workspace data and we will answer finance questions
        with links to evidence.
      </div>
    </div>
  );
}
