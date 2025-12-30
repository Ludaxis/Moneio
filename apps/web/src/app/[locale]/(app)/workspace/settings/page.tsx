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
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';

import { ThemeSelector } from '@/components/theme';
import { useWorkspace } from '@/lib/workspace';

interface Category {
  id: string;
  name: string;
  parentId: string | null;
  transactionCount: number;
}

const currencies = [
  { code: 'EUR', name: 'Euro' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'SEK', name: 'Swedish Krona' },
  { code: 'NOK', name: 'Norwegian Krone' },
  { code: 'DKK', name: 'Danish Krone' },
  { code: 'PLN', name: 'Polish Zloty' },
  { code: 'CZK', name: 'Czech Koruna' },
];

export default function WorkspaceSettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { workspace, loading: workspaceLoading, refreshWorkspaces } = useWorkspace();

  const localeMatch = pathname.match(/^\/(en|et|fa|ar)/);
  const locale = localeMatch?.[1] ?? 'en';

  const [name, setName] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('EUR');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);

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
  }, [fetchCategories]);

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

    if (!confirm('Delete this category?')) return;

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

  const handleSave = async () => {
    if (!workspace) return;

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const response = await fetch(`/api/workspaces/${workspace.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, baseCurrency }),
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
        <p className="text-muted-foreground">No workspace selected</p>
        <Link
          href={`/${locale}/workspace/new`}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Create Workspace
        </Link>
      </div>
    );
  }

  const hasChanges = name !== workspace.name || baseCurrency !== workspace.baseCurrency;

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
                <h3 className="text-lg font-semibold text-foreground">Delete Workspace</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  This action cannot be undone. All data including documents, transactions,
                  invoices, and settings will be permanently deleted.
                </p>
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
                Type <span className="font-mono text-destructive">{workspace.name}</span> to confirm
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
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteConfirmation !== workspace.name || deleting}
                className="flex-1 rounded-lg bg-destructive px-4 py-2.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
              >
                {deleting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting...
                  </span>
                ) : (
                  'Delete Workspace'
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
            <h1 className="text-2xl font-bold text-foreground">Workspace Settings</h1>
            <p className="text-sm text-muted-foreground">Manage your workspace configuration</p>
          </div>
        </div>

        {/* General Settings */}
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-6 py-4">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">General</h2>
            </div>
          </div>

          <div className="space-y-6 p-6">
            {/* Workspace Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-foreground">
                Workspace Name
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
                Base Currency
              </label>
              <select
                id="currency"
                value={baseCurrency}
                onChange={(e) => setBaseCurrency(e.target.value)}
                className="mt-2 block w-full rounded-lg border border-input bg-background px-4 py-3 text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {currencies.map((currency) => (
                  <option key={currency.code} value={currency.code}>
                    {currency.code} - {currency.name}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Used for reporting and dashboard totals. Individual transactions can use any
                currency.
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
                  Changes saved
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
                    Saving...
                  </span>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Appearance Settings */}
        <div className="rounded-xl border border-border bg-card">
          <div className="border-b border-border px-6 py-4">
            <div className="flex items-center gap-3">
              <Palette className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">Appearance</h2>
            </div>
          </div>

          <div className="space-y-6 p-6">
            <div>
              <label className="block text-sm font-medium text-foreground">Theme</label>
              <p className="mt-1 text-xs text-muted-foreground">
                Choose how Moneio looks. Select a theme or sync with your system preference.
              </p>
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
              <h2 className="font-semibold text-foreground">Categories</h2>
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
                placeholder="New category name..."
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
                Add
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
                  No categories yet. Add your first category above.
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
                            <span className="ml-2 text-xs text-muted-foreground">
                              ({category.transactionCount} transactions)
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteCategory(category.id)}
                          className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                          title="Delete category"
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
              <h2 className="font-semibold text-destructive">Danger Zone</h2>
            </div>
          </div>

          <div className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-medium text-foreground">Delete this workspace</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Once deleted, all data will be permanently removed. This includes all documents,
                  transactions, invoices, categories, and settings.
                </p>
              </div>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="flex-shrink-0 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20"
              >
                Delete Workspace
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
