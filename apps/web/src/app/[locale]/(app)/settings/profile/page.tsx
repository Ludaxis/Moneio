'use client';

import { Loader2, Save } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { extractLocaleFromPath } from '@/lib/i18n';
import { useWorkspace } from '@/lib/workspace';

interface Profile {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
}

export default function ProfileSettingsPage() {
  const tNav = useTranslations('navigation');
  const tCommon = useTranslations('common');
  const tProfile = useTranslations('profile');
  const pathname = usePathname();
  const { workspace } = useWorkspace();
  const locale = extractLocaleFromPath(pathname);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/profile');
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to load profile');
        }
        setProfile(data);
        setName(data.name || '');
        setAvatarUrl(data.avatarUrl || '');
      } catch (err) {
        setError(err instanceof Error ? err.message : tCommon('error'));
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [tCommon]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || null, avatarUrl: avatarUrl.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save profile');
      }
      setProfile(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : tCommon('error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{tNav('settings')}</p>
          <h1 className="text-2xl font-bold text-foreground">{tProfile('title')}</h1>
        </div>
        <Link
          href={`/${locale}/dashboard${workspace ? `?workspace=${workspace.id}` : ''}`}
          className="text-sm text-primary hover:underline"
        >
          {tCommon('back')}
        </Link>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">{error}</div>
      )}

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={name || profile?.email || 'avatar'}
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              (name || profile?.email || '?').slice(0, 2).toUpperCase()
            )}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{tProfile('loggedInAs')}</p>
            <p className="text-base font-medium text-foreground">{profile?.email}</p>
            <p className="text-xs text-muted-foreground">
              {tProfile('memberSince', {
                date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                  new Date(profile?.createdAt || Date.now())
                ),
              })}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium text-foreground">{tProfile('fullName')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-2 block w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder={tProfile('fullName')}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground">{tProfile('avatarUrl')}</label>
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              className="mt-2 block w-full rounded-lg border border-input bg-background px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="https://..."
            />
            <p className="mt-1 text-xs text-muted-foreground">{tProfile('avatarHint')}</p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          {saved && <span className="text-sm text-success">{tProfile('saved')}</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="ms-auto inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {tProfile('saveProfile')}
          </button>
        </div>
      </div>
    </div>
  );
}
