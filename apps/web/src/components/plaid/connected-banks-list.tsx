'use client';

import { Button } from '@moneio/ui';
import { Building2, RefreshCw, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

interface BankAccount {
  id: string;
  name: string;
  officialName: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  currency: string;
  currentBalance: number | null;
  availableBalance: number | null;
}

interface ConnectedBank {
  id: string;
  institutionName: string;
  institutionId: string | null;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  accounts: BankAccount[];
}

interface ConnectedBanksListProps {
  workspaceId: string;
  onBankDisconnected?: () => void;
  onSyncComplete?: () => void;
  refreshTrigger?: number;
}

export function ConnectedBanksList({
  workspaceId,
  onBankDisconnected,
  onSyncComplete,
  refreshTrigger,
}: ConnectedBanksListProps) {
  const [banks, setBanks] = useState<ConnectedBank[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchBanks = useCallback(async () => {
    try {
      const response = await fetch(`/api/plaid/items?workspaceId=${workspaceId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch connected banks');
      }
      const data = await response.json();
      setBanks(data.items || []);
    } catch (err) {
      console.error('Failed to fetch banks:', err);
      setError(err instanceof Error ? err.message : 'Failed to load banks');
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    fetchBanks();
  }, [fetchBanks, refreshTrigger]);

  const handleSync = useCallback(
    async (itemId: string) => {
      setSyncing(itemId);
      try {
        const response = await fetch('/api/plaid/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspaceId, itemId }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to sync');
        }

        await fetchBanks();
        onSyncComplete?.();
      } catch (err) {
        console.error('Sync failed:', err);
        setError(err instanceof Error ? err.message : 'Sync failed');
      } finally {
        setSyncing(null);
      }
    },
    [workspaceId, fetchBanks, onSyncComplete]
  );

  const handleDelete = useCallback(
    async (itemId: string) => {
      if (!confirm('Are you sure you want to disconnect this bank? This will remove all synced transactions.')) {
        return;
      }

      setDeleting(itemId);
      try {
        const response = await fetch(
          `/api/plaid/items?workspaceId=${workspaceId}&itemId=${itemId}`,
          { method: 'DELETE' }
        );

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to disconnect');
        }

        await fetchBanks();
        onBankDisconnected?.();
      } catch (err) {
        console.error('Delete failed:', err);
        setError(err instanceof Error ? err.message : 'Failed to disconnect');
      } finally {
        setDeleting(null);
      }
    },
    [workspaceId, fetchBanks, onBankDisconnected]
  );

  const formatCurrency = (amount: number | null, currency: string) => {
    if (amount === null) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4 animate-pulse">
            <div className="h-5 w-40 bg-muted rounded" />
            <div className="mt-2 h-4 w-24 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive bg-destructive/10 p-4">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={() => { setError(null); fetchBanks(); }} className="mt-2">
          Retry
        </Button>
      </div>
    );
  }

  if (banks.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <Building2 className="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-medium text-foreground">No banks connected</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect your bank accounts to automatically import transactions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {banks.map((bank) => (
        <div
          key={bank.id}
          className="rounded-lg border border-border bg-card overflow-hidden"
        >
          {/* Bank Header */}
          <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-3">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <h4 className="font-medium text-foreground">{bank.institutionName}</h4>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {bank.status === 'active' ? (
                    <>
                      <CheckCircle2 className="h-3 w-3 text-success-600" />
                      <span>Last synced: {formatDate(bank.lastSyncedAt)}</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="h-3 w-3 text-danger-600" />
                      <span className="text-danger-600">{bank.errorMessage || 'Connection error'}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleSync(bank.id)}
                disabled={syncing === bank.id}
                title="Sync transactions"
              >
                <RefreshCw className={`h-4 w-4 ${syncing === bank.id ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(bank.id)}
                disabled={deleting === bank.id}
                title="Disconnect bank"
                className="text-danger-600 hover:text-danger-700 hover:bg-danger-50"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Accounts List */}
          <div className="divide-y divide-border">
            {bank.accounts.map((account) => (
              <div key={account.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {account.name}
                    {account.mask && (
                      <span className="ml-2 text-muted-foreground">••••{account.mask}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {account.type} {account.subtype && `· ${account.subtype}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium tabular-nums text-foreground">
                    {formatCurrency(account.currentBalance, account.currency)}
                  </p>
                  {account.availableBalance !== null &&
                    account.availableBalance !== account.currentBalance && (
                      <p className="text-xs text-muted-foreground">
                        Available: {formatCurrency(account.availableBalance, account.currency)}
                      </p>
                    )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
