'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button, Input, Label } from '@moneio/ui';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function LoginPage() {
  const t = useTranslations('auth');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage('');

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage(t('checkEmail'));
    }

    setLoading(false);
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          {t('signIn')}
        </h2>
      </div>

      <form onSubmit={handleMagicLink} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">{t('email')}</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />
        </div>

        <Button type="submit" className="w-full" loading={loading}>
          {t('magicLink')}
        </Button>

        {message && (
          <p className="text-sm text-center text-neutral-600 dark:text-neutral-400">
            {message}
          </p>
        )}
      </form>

      <div className="text-center text-sm">
        <span className="text-neutral-600 dark:text-neutral-400">
          Don&apos;t have an account?{' '}
        </span>
        <Link
          href="/signup"
          className="text-primary-600 hover:text-primary-500 font-medium"
        >
          {t('signUp')}
        </Link>
      </div>
    </div>
  );
}
