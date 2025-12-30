'use client';

import { cn } from '@moneio/ui';
import { Button } from '@moneio/ui/primitives';
import {
  Sparkles,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Tag,
  FileText,
  PartyPopper,
} from 'lucide-react';
import { useState, useEffect, useCallback } from 'react';

import { SuggestionList } from '@/components/suggestions';
import { useWorkspace } from '@/lib/workspace';

interface Suggestion {
  id: string;
  type: 'categorization' | 'match';
  confidence: number;
  transaction: {
    id: string;
    description: string | null;
    amount: number;
    currency: string;
    postedAt: string;
  };
  suggestedCategory?: {
    id: string;
    name: string;
  };
  matchedInvoice?: {
    id: string;
    invoiceNumber: string | null;
    total: number;
  };
  rationale?: string;
}

interface SuggestionsResponse {
  suggestions: Suggestion[];
  counts: {
    total: number;
    categorization: number;
    match: number;
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
  };
}

type TabType = 'all' | 'categories' | 'matches';

export default function ReviewPage() {
  const { workspace, loading: workspaceLoading } = useWorkspace();
  const workspaceId = workspace?.id;

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [counts, setCounts] = useState<SuggestionsResponse['counts'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkApproving, setBulkApproving] = useState(false);

  // Fetch suggestions
  const fetchSuggestions = useCallback(async () => {
    if (!workspaceId) return;

    setLoading(true);
    try {
      const typeParam =
        activeTab === 'all'
          ? ''
          : `&type=${activeTab === 'categories' ? 'categorization' : 'match'}`;
      const response = await fetch(`/api/suggestions?workspaceId=${workspaceId}${typeParam}`);
      if (response.ok) {
        const data: SuggestionsResponse = await response.json();
        setSuggestions(data.suggestions);
        setCounts(data.counts);
      }
    } catch (error) {
      console.error('Failed to fetch suggestions:', error);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, activeTab]);

  useEffect(() => {
    if (workspaceId) {
      fetchSuggestions();
    } else {
      setLoading(false);
    }
  }, [workspaceId, fetchSuggestions]);

  // Handle single approve
  const handleApprove = async (id: string) => {
    const suggestion = suggestions.find((s) => s.id === id);
    if (!suggestion || !workspaceId) return;

    if (suggestion.type === 'categorization' && suggestion.suggestedCategory) {
      const response = await fetch(`/api/transactions/${suggestion.transaction.id}/categorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          categoryId: suggestion.suggestedCategory.id,
          suggestionId: suggestion.id,
        }),
      });

      if (response.ok) {
        setSuggestions((prev) => prev.filter((s) => s.id !== id));
        setCounts((prev) =>
          prev
            ? {
                ...prev,
                total: prev.total - 1,
                categorization: prev.categorization - 1,
                highConfidence:
                  suggestion.confidence >= 80 ? prev.highConfidence - 1 : prev.highConfidence,
                mediumConfidence:
                  suggestion.confidence >= 50 && suggestion.confidence < 80
                    ? prev.mediumConfidence - 1
                    : prev.mediumConfidence,
                lowConfidence:
                  suggestion.confidence < 50 ? prev.lowConfidence - 1 : prev.lowConfidence,
              }
            : null
        );
      }
    } else if (suggestion.type === 'match') {
      const response = await fetch(`/api/matches/${suggestion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          status: 'approved',
        }),
      });

      if (response.ok) {
        setSuggestions((prev) => prev.filter((s) => s.id !== id));
        setCounts((prev) =>
          prev
            ? {
                ...prev,
                total: prev.total - 1,
                match: prev.match - 1,
                highConfidence:
                  suggestion.confidence >= 80 ? prev.highConfidence - 1 : prev.highConfidence,
                mediumConfidence:
                  suggestion.confidence >= 50 && suggestion.confidence < 80
                    ? prev.mediumConfidence - 1
                    : prev.mediumConfidence,
                lowConfidence:
                  suggestion.confidence < 50 ? prev.lowConfidence - 1 : prev.lowConfidence,
              }
            : null
        );
      }
    }
  };

  // Handle single reject
  const handleReject = async (id: string) => {
    const suggestion = suggestions.find((s) => s.id === id);
    if (!suggestion || !workspaceId) return;

    if (suggestion.type === 'categorization') {
      const response = await fetch(`/api/transactions/${suggestion.transaction.id}/categorize`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          suggestionId: suggestion.id,
        }),
      });

      if (response.ok) {
        setSuggestions((prev) => prev.filter((s) => s.id !== id));
        setCounts((prev) =>
          prev
            ? {
                ...prev,
                total: prev.total - 1,
                categorization: prev.categorization - 1,
                highConfidence:
                  suggestion.confidence >= 80 ? prev.highConfidence - 1 : prev.highConfidence,
                mediumConfidence:
                  suggestion.confidence >= 50 && suggestion.confidence < 80
                    ? prev.mediumConfidence - 1
                    : prev.mediumConfidence,
                lowConfidence:
                  suggestion.confidence < 50 ? prev.lowConfidence - 1 : prev.lowConfidence,
              }
            : null
        );
      }
    } else if (suggestion.type === 'match') {
      const response = await fetch(`/api/matches/${suggestion.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          status: 'rejected',
        }),
      });

      if (response.ok) {
        setSuggestions((prev) => prev.filter((s) => s.id !== id));
        setCounts((prev) =>
          prev
            ? {
                ...prev,
                total: prev.total - 1,
                match: prev.match - 1,
                highConfidence:
                  suggestion.confidence >= 80 ? prev.highConfidence - 1 : prev.highConfidence,
                mediumConfidence:
                  suggestion.confidence >= 50 && suggestion.confidence < 80
                    ? prev.mediumConfidence - 1
                    : prev.mediumConfidence,
                lowConfidence:
                  suggestion.confidence < 50 ? prev.lowConfidence - 1 : prev.lowConfidence,
              }
            : null
        );
      }
    }
  };

  // Handle bulk approve high confidence
  const handleBulkApproveHighConfidence = async () => {
    if (!workspaceId) return;

    setBulkApproving(true);
    try {
      const highConfidenceIds = suggestions.filter((s) => s.confidence >= 80).map((s) => s.id);

      if (highConfidenceIds.length === 0) return;

      const response = await fetch('/api/suggestions/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          action: 'approve',
          suggestionIds: highConfidenceIds,
        }),
      });

      if (response.ok) {
        // Refetch to get updated list
        await fetchSuggestions();
      }
    } catch (error) {
      console.error('Failed to bulk approve:', error);
    } finally {
      setBulkApproving(false);
    }
  };

  if (workspaceLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">Select or create a workspace to review suggestions</p>
      </div>
    );
  }

  const highConfidenceCount = counts?.highConfidence ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Sparkles className="h-6 w-6 text-primary" />
            AI Review
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Review and approve AI suggestions for transactions
          </p>
        </div>
        {highConfidenceCount > 0 && (
          <Button
            variant="success"
            onClick={handleBulkApproveHighConfidence}
            disabled={bulkApproving}
          >
            {bulkApproving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Approving...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Approve High Confidence ({highConfidenceCount})
              </>
            )}
          </Button>
        )}
      </div>

      {/* Stats */}
      {counts && counts.total > 0 && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Sparkles className="h-4 w-4" />
              Total Pending
            </div>
            <p className="mt-1 text-2xl font-bold text-foreground">{counts.total}</p>
          </div>
          <div className="rounded-lg border border-success-200 bg-success-50 p-4 dark:border-success-800 dark:bg-success-900/20">
            <div className="flex items-center gap-2 text-sm text-success-700 dark:text-success-400">
              <CheckCircle2 className="h-4 w-4" />
              High Confidence
            </div>
            <p className="mt-1 text-2xl font-bold text-success-600">{counts.highConfidence}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Tag className="h-4 w-4" />
              Categories
            </div>
            <p className="mt-1 text-2xl font-bold text-foreground">{counts.categorization}</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="h-4 w-4" />
              Matches
            </div>
            <p className="mt-1 text-2xl font-bold text-foreground">{counts.match}</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-muted/30 p-1">
        <button
          onClick={() => setActiveTab('all')}
          className={cn(
            'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'all'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          All ({counts?.total ?? 0})
        </button>
        <button
          onClick={() => setActiveTab('categories')}
          className={cn(
            'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'categories'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Categories ({counts?.categorization ?? 0})
        </button>
        <button
          onClick={() => setActiveTab('matches')}
          className={cn(
            'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'matches'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Matches ({counts?.match ?? 0})
        </button>
      </div>

      {/* Content */}
      <div className="rounded-lg border border-border bg-card p-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : suggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success-100 dark:bg-success-900/30">
              <PartyPopper className="h-8 w-8 text-success-600" />
            </div>
            <h3 className="mt-4 text-xl font-semibold text-foreground">All caught up!</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              No pending AI suggestions to review.
            </p>
          </div>
        ) : (
          <SuggestionList
            suggestions={suggestions}
            selectedIds={selectedIds}
            onSelectionChange={setSelectedIds}
            onApprove={handleApprove}
            onReject={handleReject}
            showCheckboxes={false}
            groupByConfidence={true}
          />
        )}
      </div>
    </div>
  );
}
