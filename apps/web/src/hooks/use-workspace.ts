'use client';

import { useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';

interface Workspace {
  id: string;
  name: string;
  baseCurrency: string;
  role: string;
}

export function useWorkspace() {
  const searchParams = useSearchParams();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWorkspaces = async () => {
      try {
        const response = await fetch('/api/workspaces');
        if (response.ok) {
          const data = await response.json();
          setWorkspaces(data);

          // Set current workspace from URL or first workspace
          const workspaceId = searchParams.get('workspace');
          const workspace = workspaceId
            ? data.find((w: Workspace) => w.id === workspaceId)
            : data[0];
          setCurrentWorkspace(workspace || data[0] || null);
        }
      } catch (error) {
        console.error('Failed to fetch workspaces:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchWorkspaces();
  }, [searchParams]);

  return {
    workspaces,
    currentWorkspace,
    workspaceId: currentWorkspace?.id,
    baseCurrency: currentWorkspace?.baseCurrency || 'EUR',
    loading,
  };
}
