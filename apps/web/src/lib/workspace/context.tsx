'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

const WORKSPACE_STORAGE_KEY = 'moneio_workspace_id';

interface Workspace {
  id: string;
  name: string;
  baseCurrency: string;
  calendarSystem: string;
  role: string;
}

interface WorkspaceContextValue {
  workspace: Workspace | null;
  workspaces: Workspace[];
  loading: boolean;
  setWorkspace: (workspace: Workspace) => void;
  refreshWorkspaces: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

// Helper to get stored workspace ID from localStorage
function getStoredWorkspaceId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(WORKSPACE_STORAGE_KEY);
  } catch {
    return null;
  }
}

// Helper to store workspace ID in localStorage
function storeWorkspaceId(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(WORKSPACE_STORAGE_KEY, id);
  } catch {
    // Ignore localStorage errors
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspaceState] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const fetchWorkspaces = async () => {
    try {
      const response = await fetch('/api/workspaces');
      if (response.ok) {
        const data = await response.json();
        setWorkspaces(data);
        return data;
      }
    } catch (error) {
      console.error('Failed to fetch workspaces:', error);
    }
    return [];
  };

  // Custom setWorkspace that also persists to localStorage and updates URL
  const setWorkspace = useCallback(
    (ws: Workspace) => {
      setWorkspaceState(ws);
      storeWorkspaceId(ws.id);

      // Update URL with workspace param if not already set
      const currentWorkspaceId = searchParams.get('workspace');
      if (currentWorkspaceId !== ws.id) {
        const params = new URLSearchParams(searchParams.toString());
        params.set('workspace', ws.id);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }
    },
    [searchParams, router, pathname]
  );

  // Initial load - determine workspace from URL, localStorage, or first available
  useEffect(() => {
    if (initialized) return;

    fetchWorkspaces().then((data) => {
      setLoading(false);
      setInitialized(true);

      if (data.length === 0) return;

      // Priority: URL param > localStorage > first workspace
      const urlWorkspaceId = searchParams.get('workspace');
      const storedWorkspaceId = getStoredWorkspaceId();

      let selectedWorkspace: Workspace | undefined;

      // 1. Try URL param first
      if (urlWorkspaceId) {
        selectedWorkspace = data.find((w: Workspace) => w.id === urlWorkspaceId);
      }

      // 2. Fall back to localStorage
      if (!selectedWorkspace && storedWorkspaceId) {
        selectedWorkspace = data.find((w: Workspace) => w.id === storedWorkspaceId);
      }

      // 3. Fall back to first workspace
      if (!selectedWorkspace) {
        selectedWorkspace = data[0];
      }

      // Set workspace and ensure URL is updated
      if (selectedWorkspace) {
        setWorkspaceState(selectedWorkspace);
        storeWorkspaceId(selectedWorkspace.id);

        // Always ensure URL has workspace param
        if (searchParams.get('workspace') !== selectedWorkspace.id) {
          const params = new URLSearchParams(searchParams.toString());
          params.set('workspace', selectedWorkspace.id);
          router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        }
      }
    });
  }, [initialized, searchParams, router, pathname]);

  // Handle URL changes (e.g., user manually changes URL or uses browser back)
  useEffect(() => {
    if (!initialized || workspaces.length === 0) return;

    const urlWorkspaceId = searchParams.get('workspace');
    if (urlWorkspaceId && urlWorkspaceId !== workspace?.id) {
      const ws = workspaces.find((w) => w.id === urlWorkspaceId);
      if (ws) {
        setWorkspaceState(ws);
        storeWorkspaceId(ws.id);
      }
    }
  }, [searchParams, workspaces, workspace?.id, initialized]);

  const refreshWorkspaces = async () => {
    const data = await fetchWorkspaces();
    // If current workspace was deleted, switch to first available
    if (data.length > 0 && workspace && !data.find((w: Workspace) => w.id === workspace.id)) {
      setWorkspace(data[0]);
    }
  };

  return (
    <WorkspaceContext.Provider
      value={{ workspace, workspaces, loading, setWorkspace, refreshWorkspaces }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
