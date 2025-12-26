'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Input, Label } from '@moneio/ui';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

export default function SignupPage() {
  const t = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  async function handleSignup(e: React.FormEvent) {
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
          {t('signUp')}
        </h2>
      </div>

      <form onSubmit={handleSignup} className="space-y-4">
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
          {t('signUp')}
        </Button>

        {message && (
          <p className="text-sm text-center text-neutral-600 dark:text-neutral-400">
            {message}
          </p>
        )}
      </form>

      <div className="text-center text-sm">
        <span className="text-neutral-600 dark:text-neutral-400">
          Already have an account?{' '}
        </span>
        <Link
          href="/login"
          className="text-primary-600 hover:text-primary-500 font-medium"
        >
          {t('signIn')}
        </Link>
      </div>
    </div>
  );
}
