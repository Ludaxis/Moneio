'use client';

import { cn } from '@moneio/ui';
import {
  ArrowLeft,
  Building2,
  Palette,
  Tag,
  Trash2,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  X,
  Plus,
  Users,
  Shield,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useEffect, useCallback } from 'react';

import { ThemeSelector } from '@/components/theme';
import { extractLocaleFromPath } from '@/lib/i18n';
import { useWorkspace } from '@/lib/workspace';

interface Category {
  id: string;
  name: string;
  parentId: string | null;
  transactionCount: number;
}

const currencies = [
  { code: 'USD', nameKey: 'usDollar' },
  { code: 'EUR', nameKey: 'euro' },
  { code: 'IRR', nameKey: 'iranianRial' },
  { code: 'AED', nameKey: 'uaeDirham' },
  { code: 'GBP', nameKey: 'britishPound' },
  { code: 'CHF', nameKey: 'swissFranc' },
  { code: 'SEK', nameKey: 'swedishKrona' },
  { code: 'NOK', nameKey: 'norwegianKrone' },
  { code: 'DKK', nameKey: 'danishKrone' },
  { code: 'PLN', nameKey: 'polishZloty' },
  { code: 'CZK', nameKey: 'czechKoruna' },
];

type WorkspaceRole = 'owner' | 'admin' | 'member';

interface WorkspaceMember {
  id: string;
  userId: string;
  email: string;
  name: string | null;
  role: WorkspaceRole;
  createdAt: string;
  isCurrentUser: boolean;
}

export default function WorkspaceSettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('settings');
  const tWorkspace = useTranslations('workspace');
  const tCommon = useTranslations('common');
  const tCurrencies = useTranslations('currencies');
  const tCalendar = useTranslations('calendar');
  const { workspace, loading: workspaceLoading, refreshWorkspaces } = useWorkspace();

  const locale = extractLocaleFromPath(pathname);

  const [name, setName] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('EUR');
  const [calendarSystem, setCalendarSystem] = useState<'gregorian' | 'jalali'>('gregorian');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Members state
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>('member');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [updatingMemberId, setUpdatingMemberId] = useState<string | null>(null);

  // Categories state
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  // Initialize form with workspace data
  useEffect(() => {
    if (workspace) {
      setName(workspace.name);
      setBaseCurrency(workspace.baseCurrency);
      setCalendarSystem((workspace.calendarSystem as 'gregorian' | 'jalali') || 'gregorian');
    }
  }, [workspace]);

  const canManageMembers = workspace?.role === 'owner' || workspace?.role === 'admin';
  const ownerCount = members.filter((m) => m.role === 'owner').length;

  const fetchMembers = useCallback(async () => {
    if (!workspace) return;
    setMembersLoading(true);
    setMemberError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/members`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load members');
      }
      const data = await res.json();
      setMembers(data.members || []);
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : 'Failed to load members');
    } finally {
      setMembersLoading(false);
    }
  }, [workspace]);

  // Fetch categories
  const fetchCategories = useCallback(async () => {
    if (!workspace) return;

    setLoadingCategories(true);
    try {
      const response = await fetch(`/api/categories?workspaceId=${workspace.id}&pageSize=100`);
      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
      }
    } catch (err) {
      console.error('Failed to fetch categories:', err);
    } finally {
      setLoadingCategories(false);
    }
  }, [workspace]);

  useEffect(() => {
    fetchCategories();
    fetchMembers();
  }, [fetchCategories, fetchMembers]);

  // Add category
  const handleAddCategory = async () => {
    if (!workspace || !newCategoryName.trim()) return;

    setAddingCategory(true);
    setCategoryError(null);

    try {
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId: workspace.id,
          name: newCategoryName.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create category');
      }

      setNewCategoryName('');
      fetchCategories();
    } catch (err) {
      setCategoryError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setAddingCategory(false);
    }
  };

  // Delete category
  const handleDeleteCategory = async (categoryId: string) => {
    if (!workspace) return;

    if (!confirm(t('deleteCategoryConfirm'))) return;

    try {
      const response = await fetch(`/api/categories/${categoryId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId: workspace.id }),
      });

      if (response.ok) {
        fetchCategories();
      }
    } catch (err) {
      console.error('Failed to delete category:', err);
    }
  };

  const handleInviteMember = async () => {
    if (!workspace || !inviteEmail.trim()) return;
    setInviteLoading(true);
    setMemberError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add member');
      }
      setMembers((prev) => [...prev, data]);
      setInviteEmail('');
      setInviteRole('member');
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : tCommon('error'));
    } finally {
      setInviteLoading(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: WorkspaceRole) => {
    if (!workspace) return;
    setUpdatingMemberId(memberId);
    setMemberError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update role');
      }
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role: data.role } : m)));
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : tCommon('error'));
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!workspace) return;
    setUpdatingMemberId(memberId);
    setMemberError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/members/${memberId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to remove member');
      }
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : tCommon('error'));
    } finally {
      setUpdatingMemberId(null);
    }
  };

  const handleSave = async () => {
    if (!workspace) return;

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const response = await fetch(`/api/workspaces/${workspace.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, baseCurrency, calendarSystem }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update workspace');
      }

      setSaved(true);
      refreshWorkspaces();

      // Hide success message after 3 seconds
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!workspace || deleteConfirmation !== workspace.name) return;

    setDeleting(true);

    try {
      const response = await fetch(`/api/workspaces/${workspace.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete workspace');
      }

      // Redirect to home after deletion
      router.push(`/${locale}/dashboard`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete workspace');
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  if (workspaceLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">{tWorkspace('noWorkspaceSelected')}</p>
        <Link
          href={`/${locale}/workspace/new`}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {tWorkspace('create')}
        </Link>
      </div>
    );
  }

  const hasChanges =
    name !== workspace.name ||
    baseCurrency !== workspace.baseCurrency ||
    calendarSystem !== (workspace.calendarSystem || 'gregorian');

  return (
    <>
      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-destructive/20 bg-card p-6 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground">{t('deleteWorkspace')}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t('deleteModalWarning')}</p>
              </div>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmation('');
                }}
                className="rounded p-1 hover:bg-accent"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-6">
              <label className="block text-sm font-medium text-foreground">
                {t('confirmDelete')}
              </label>
              <input
                type="text"
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
                placeholder={workspace.name}
                className="mt-2 block w-full rounded-lg border border-input bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-destructive"
              />
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteConfirmation('');
                }}
                className="flex-1 rounded-lg border border-input bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent"
              >
                {tCommon('cancel')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteConfirmation !== workspace.name || deleting}
                className="flex-1 rounded-lg bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('deleting')}
                  </span>
                ) : (
                  t('deleteWorkspace')
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-2xl space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            href={`/${locale}/dashboard${workspace ? `?workspace=${workspace.id}` : ''}`}
            className="rounded-lg p-2 hover:bg-accent"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('workspaceSettings')}</h1>
            <p className="text-sm text-muted-foreground">{t('manageConfiguration')}</p>
          </div>
        </div>

        {/* General Settings */}
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-6 py-4">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">{t('general')}</h2>
            </div>
          </div>

          <div className="space-y-6 p-6">
            {/* Workspace Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-foreground">
                {tWorkspace('name')}
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-2 block w-full rounded-lg border border-input bg-background px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="My Business"
              />
            </div>

            {/* Base Currency */}
            <div>
              <label htmlFor="currency" className="block text-sm font-medium text-foreground">
                {tWorkspace('currency')}
              </label>
              <select
                id="currency"
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value)}
                className="mt-2 block w-full rounded-lg border border-input bg-background px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {currencies.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code} - {tCurrencies(currency.nameKey)}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-muted-foreground">{t('currencyDescription')}</p>
            </div>

            {/* Calendar System */}
            <div>
              <label htmlFor="calendarSystem" className="text-sm font-medium text-foreground">
                {tCalendar('system')}
              </label>
              <select
                id="calendarSystem"
                value={calendarSystem}
                onChange={(e) => setCalendarSystem(e.target.value as 'gregorian' | 'jalali')}
                className="mt-2 block w-full rounded-lg border border-input bg-background px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="gregorian">{tCalendar('gregorian')}</option>
                <option value="jalali">{tCalendar('jalali')}</option>
              </select>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {tCalendar('systemDescription')}
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Save Button */}
            <div className="flex items-center justify-end gap-4">
              {saved && (
                <span className="flex items-center gap-2 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4" />
                  {t('changesSaved')}
                </span>
              )}
              <button
                onClick={handleSave}
                disabled={saving || !hasChanges || !name.trim()}
                className={cn(
                  'rounded-lg px-6 py-2.5 text-sm font-medium transition-all',
                  hasChanges
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-muted text-muted-foreground',
                  'disabled:opacity-50'
                )}
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('saving')}
                  </span>
                ) : (
                  t('saveChanges')
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Team & Roles */}
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-6 py-4">
            <div className="flex items-center gap-3">
              <Users className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">{tWorkspace('team')}</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {tWorkspace('manageAccess')}
              </span>
            </div>
          </div>

          <div className="p-6 space-y-4">
            {memberError && <p className="text-sm text-destructive">{memberError}</p>}
            {!canManageMembers && (
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                {tWorkspace('onlyAdminsOwners')}
              </div>
            )}

            {/* Invite */}
            {canManageMembers && (
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/20 p-3 sm:flex-row sm:items-center">
                <div className="flex-1 space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    {tWorkspace('inviteMember')}
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="teammate@company.com"
                      className="flex-1 rounded-lg border border-input bg-background px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as WorkspaceRole)}
                      className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="member">{tWorkspace('member')}</option>
                      <option value="admin">{tWorkspace('admin')}</option>
                      <option value="owner">{tWorkspace('owner')}</option>
                    </select>
                  </div>
                </div>
                <button
                  onClick={handleInviteMember}
                  disabled={inviteLoading || !inviteEmail.trim()}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {inviteLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {tWorkspace('addMember')}
                </button>
              </div>
            )}

            {/* Members list */}
            <div className="rounded-lg border border-border">
              <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs font-medium text-muted-foreground">
                <div className="w-6" />
                <div className="flex-1">{tWorkspace('memberEmail')}</div>
                <div className="w-32">{tWorkspace('role')}</div>
                <div className="w-20 text-right">{tCommon('actions')}</div>
              </div>
              {membersLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : members.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {tWorkspace('noMembers')}
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {members.map((member) => {
                    const disableOwnerDemote = member.role === 'owner' && ownerCount <= 1;
                    const isSelf = member.isCurrentUser;
                    return (
                      <div key={member.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <Shield className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1">
                          <div className="font-medium text-foreground">
                            {member.name || member.email}
                          </div>
                          <div className="text-xs text-muted-foreground">{member.email}</div>
                        </div>
                        <div className="w-32">
                          {canManageMembers && !isSelf ? (
                            <select
                              value={member.role}
                              onChange={(e) =>
                                handleRoleChange(member.id, e.target.value as WorkspaceRole)
                              }
                              disabled={updatingMemberId === member.id || disableOwnerDemote}
                              className="w-full rounded-lg border border-input bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                            >
                              <option value="member">{tWorkspace('member')}</option>
                              <option value="admin">{tWorkspace('admin')}</option>
                              <option value="owner">{tWorkspace('owner')}</option>
                            </select>
                          ) : (
                            <span className="text-xs uppercase text-muted-foreground">
                              {member.role}
                            </span>
                          )}
                        </div>
                        <div className="w-20 text-right">
                          {canManageMembers && !isSelf ? (
                            <button
                              onClick={() => handleRemoveMember(member.id)}
                              disabled={updatingMemberId === member.id || disableOwnerDemote}
                              className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                              title={tCommon('delete')}
                            >
                              {updatingMemberId === member.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Appearance Settings */}
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-6 py-4">
            <div className="flex items-center gap-3">
              <Palette className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">{t('appearance')}</h2>
            </div>
          </div>

          <div className="space-y-6 p-6">
            <div>
              <label className="block text-sm font-medium text-foreground">{t('theme')}</label>
              <p className="mt-1 text-xs text-muted-foreground">{t('themeDescription')}</p>
              <div className="mt-4">
                <ThemeSelector />
              </div>
            </div>
          </div>
        </div>

        {/* Categories */}
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-6 py-4">
            <div className="flex items-center gap-3">
              <Tag className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">{t('categories')}</h2>
            </div>
          </div>

          <div className="p-6">
            {/* Add Category */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddCategory();
                }}
                placeholder={t('newCategoryPlaceholder')}
                className="flex-1 rounded-lg border border-input bg-background px-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button
                onClick={handleAddCategory}
                disabled={addingCategory || !newCategoryName.trim()}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {addingCategory ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {t('addCategory')}
              </button>
            </div>

            {categoryError && <p className="mt-2 text-sm text-destructive">{categoryError}</p>}

            {/* Categories List */}
            <div className="mt-4">
              {loadingCategories ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : categories.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t('noCategories')}
                </p>
              ) : (
                <div className="space-y-2">
                  {categories
                    .filter((cat) => !cat.parentId)
                    .map((category) => (
                      <div
                        key={category.id}
                        className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3"
                      >
                        <div>
                          <span className="font-medium text-foreground">{category.name}</span>
                          {category.transactionCount > 0 && (
                            <span className="ms-2 text-xs text-muted-foreground">
                              {t('transactionCount', { count: category.transactionCount })}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteCategory(category.id)}
                          className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title={tCommon('delete')}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="rounded-xl border border-destructive/20 bg-card">
          <div className="border-b border-destructive/20 px-6 py-4">
            <div className="flex items-center gap-3">
              <Trash2 className="h-5 w-5 text-destructive" />
              <h2 className="font-semibold text-destructive">{t('dangerZone')}</h2>
            </div>
          </div>

          <div className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-medium text-foreground">{t('deleteThisWorkspace')}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t('deleteWarningFull')}</p>
              </div>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="flex-shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20"
              >
                {t('deleteWorkspace')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
