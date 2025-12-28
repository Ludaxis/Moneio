'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

export default function ProfileSettingsPage() {
  const tNav = useTranslations('navigation');
  const tCommon = useTranslations('common');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{tNav('settings')}</p>
          <h1 className="text-2xl font-bold text-foreground">Profile</h1>
        </div>
        <Link href="/" className="text-sm text-primary hover:underline">
          {tCommon('back')}
        </Link>
      </div>
      <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
        Profile settings are coming soon. Update your workspace and login email in Supabase for now.
      </div>
    </div>
  );
}
