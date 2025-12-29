'use client';

import { Button } from '@moneio/ui';
import { Building2, Loader2 } from 'lucide-react';
import { useCallback, useState } from 'react';
import { usePlaidLink, type PlaidLinkOnSuccess } from 'react-plaid-link';

interface PlaidLinkButtonProps {
  workspaceId: string;
  onSuccess?: (itemId: string, accountCount: number) => void;
  onError?: (error: string) => void;
}

export function PlaidLinkButton({ workspaceId, onSuccess, onError }: PlaidLinkButtonProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exchanging, setExchanging] = useState(false);

  // Create link token on button click
  const createLinkToken = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/plaid/link-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create link token');
      }

      const data = await response.json();
      setLinkToken(data.linkToken);
    } catch (error) {
      console.error('Failed to create link token:', error);
      onError?.(error instanceof Error ? error.message : 'Failed to initialize Plaid Link');
    } finally {
      setLoading(false);
    }
  }, [workspaceId, onError]);

  // Handle successful link
  const handleSuccess: PlaidLinkOnSuccess = useCallback(
    async (publicToken, metadata) => {
      setExchanging(true);
      try {
        const response = await fetch('/api/plaid/exchange-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workspaceId,
            publicToken,
            metadata: {
              institutionId: metadata.institution?.institution_id,
              institutionName: metadata.institution?.name,
            },
          }),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to connect bank');
        }

        const data = await response.json();
        onSuccess?.(data.itemId, data.accountCount);
      } catch (error) {
        console.error('Failed to exchange token:', error);
        onError?.(error instanceof Error ? error.message : 'Failed to connect bank');
      } finally {
        setExchanging(false);
        setLinkToken(null);
      }
    },
    [workspaceId, onSuccess, onError]
  );

  // Initialize Plaid Link
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: handleSuccess,
    onExit: () => setLinkToken(null),
  });

  // Open Plaid Link when token is ready
  const handleClick = useCallback(async () => {
    if (linkToken && ready) {
      open();
    } else {
      await createLinkToken();
    }
  }, [linkToken, ready, open, createLinkToken]);

  // Auto-open when token becomes available
  if (linkToken && ready && !exchanging) {
    open();
  }

  return (
    <Button
      onClick={handleClick}
      disabled={loading || exchanging}
      variant="outline"
      className="gap-2"
    >
      {loading || exchanging ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Building2 className="h-4 w-4" />
      )}
      {exchanging ? 'Connecting...' : 'Connect Bank'}
    </Button>
  );
}
