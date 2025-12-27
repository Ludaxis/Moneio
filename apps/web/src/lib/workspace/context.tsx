'use client';

import { useSearchParams } from 'next/navigation';
import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface Workspace {
  id: string;
  name: string;
  baseCurrency: string;
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

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const searchParams = useSearchParams();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    fetchWorkspaces().then((data) => {
      setLoading(false);
      // Set workspace from URL or first
      const workspaceId = searchParams.get('workspace');
      if (data.length > 0) {
        const ws = workspaceId ? data.find((w: Workspace) => w.id === workspaceId) : data[0];
        setWorkspace(ws || data[0]);
      }
    });
  }, []);

  useEffect(() => {
    // Update workspace when URL changes
    const workspaceId = searchParams.get('workspace');
    if (workspaceId && workspaces.length > 0) {
      const ws = workspaces.find((w) => w.id === workspaceId);
      if (ws) setWorkspace(ws);
    }
  }, [searchParams, workspaces]);

  const refreshWorkspaces = async () => {
    const data = await fetchWorkspaces();
    if (data.length > 0 && !workspace) {
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
