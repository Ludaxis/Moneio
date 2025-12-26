'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ChevronDown, Plus, Check } from 'lucide-react';

interface Workspace {
  id: string;
  name: string;
  baseCurrency: string;
  role: string;
}

export function WorkspaceSwitcher() {
  const t = useTranslations('workspace');
  const router = useRouter();
  const searchParams = useSearchParams();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  useEffect(() => {
    // Set current workspace from URL or first workspace
    const workspaceId = searchParams.get('workspace');
    if (workspaces.length > 0) {
      const workspace = workspaceId
        ? workspaces.find((w) => w.id === workspaceId)
        : workspaces[0];
      setCurrentWorkspace(workspace || workspaces[0]);
    }
  }, [workspaces, searchParams]);

  const fetchWorkspaces = async () => {
    try {
      const response = await fetch('/api/workspaces');
      if (response.ok) {
        const data = await response.json();
        setWorkspaces(data);
      }
    } catch (error) {
      console.error('Failed to fetch workspaces:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectWorkspace = (workspace: Workspace) => {
    setCurrentWorkspace(workspace);
    setIsOpen(false);
    // Update URL with workspace
    const url = new URL(window.location.href);
    url.searchParams.set('workspace', workspace.id);
    router.push(url.pathname + url.search);
  };

  if (loading) {
    return (
      <div className="h-10 w-40 animate-pulse rounded-lg bg-muted" />
    );
  }

  if (workspaces.length === 0) {
    return (
      <button
        onClick={() => router.push('/workspace/new')}
        className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        <Plus className="h-4 w-4" />
        {t('create')}
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
      >
        <span>{currentWorkspace?.name || t('switch')}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown */}
          <div className="absolute end-0 z-50 mt-2 w-64 rounded-lg border border-border bg-popover p-1 shadow-lg">
            <div className="py-1">
              {workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  onClick={() => selectWorkspace(workspace)}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-popover-foreground hover:bg-accent"
                >
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{workspace.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {workspace.baseCurrency} • {workspace.role}
                    </span>
                  </div>
                  {currentWorkspace?.id === workspace.id && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </button>
              ))}
            </div>

            <div className="border-t border-border pt-1">
              <button
                onClick={() => {
                  setIsOpen(false);
                  router.push('/workspace/new');
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-popover-foreground hover:bg-accent"
              >
                <Plus className="h-4 w-4" />
                {t('create')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
