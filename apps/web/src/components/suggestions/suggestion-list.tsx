'use client';

import { cn } from '@moneio/ui';
import { CheckCircle, AlertCircle, HelpCircle, PartyPopper } from 'lucide-react';

import { SuggestionCard } from './suggestion-card';

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

interface SuggestionListProps {
  suggestions: Suggestion[];
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  showCheckboxes?: boolean;
  groupByConfidence?: boolean;
  emptyMessage?: string;
}

/**
 * Suggestion List
 *
 * Displays a list of AI suggestions, optionally grouped by confidence level.
 */
export function SuggestionList({
  suggestions,
  selectedIds = new Set(),
  onSelectionChange,
  onApprove,
  onReject,
  showCheckboxes = false,
  groupByConfidence = true,
  emptyMessage = 'No suggestions',
}: SuggestionListProps) {
  const handleSelect = (id: string, selected: boolean) => {
    const newSelection = new Set(selectedIds);
    if (selected) {
      newSelection.add(id);
    } else {
      newSelection.delete(id);
    }
    onSelectionChange?.(newSelection);
  };

  if (suggestions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-success-100 dark:bg-success-900/30">
          <PartyPopper className="h-6 w-6 text-success-600" />
        </div>
        <p className="mt-4 text-lg font-medium text-foreground">All caught up!</p>
        <p className="mt-1 text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  if (!groupByConfidence) {
    return (
      <div className="space-y-2">
        {suggestions.map((suggestion) => (
          <SuggestionCard
            key={suggestion.id}
            {...suggestion}
            selected={selectedIds.has(suggestion.id)}
            onSelect={handleSelect}
            onApprove={onApprove}
            onReject={onReject}
            showCheckbox={showCheckboxes}
          />
        ))}
      </div>
    );
  }

  // Group by confidence
  const highConfidence = suggestions.filter((s) => s.confidence >= 80);
  const mediumConfidence = suggestions.filter((s) => s.confidence >= 50 && s.confidence < 80);
  const lowConfidence = suggestions.filter((s) => s.confidence < 50);

  return (
    <div className="space-y-6">
      {/* High confidence */}
      {highConfidence.length > 0 && (
        <SuggestionSection
          title="High Confidence"
          subtitle="Recommended for approval"
          icon={<CheckCircle className="h-5 w-5 text-success-600" />}
          accentColor="success"
          count={highConfidence.length}
        >
          {highConfidence.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              {...suggestion}
              selected={selectedIds.has(suggestion.id)}
              onSelect={handleSelect}
              onApprove={onApprove}
              onReject={onReject}
              showCheckbox={showCheckboxes}
            />
          ))}
        </SuggestionSection>
      )}

      {/* Medium confidence */}
      {mediumConfidence.length > 0 && (
        <SuggestionSection
          title="Review Recommended"
          subtitle="May need manual verification"
          icon={<HelpCircle className="h-5 w-5 text-warning-600" />}
          accentColor="warning"
          count={mediumConfidence.length}
        >
          {mediumConfidence.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              {...suggestion}
              selected={selectedIds.has(suggestion.id)}
              onSelect={handleSelect}
              onApprove={onApprove}
              onReject={onReject}
              showCheckbox={showCheckboxes}
            />
          ))}
        </SuggestionSection>
      )}

      {/* Low confidence */}
      {lowConfidence.length > 0 && (
        <SuggestionSection
          title="Low Confidence"
          subtitle="AI is uncertain about these"
          icon={<AlertCircle className="h-5 w-5 text-danger-600" />}
          accentColor="danger"
          count={lowConfidence.length}
        >
          {lowConfidence.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              {...suggestion}
              selected={selectedIds.has(suggestion.id)}
              onSelect={handleSelect}
              onApprove={onApprove}
              onReject={onReject}
              showCheckbox={showCheckboxes}
            />
          ))}
        </SuggestionSection>
      )}
    </div>
  );
}

interface SuggestionSectionProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  accentColor: 'success' | 'warning' | 'danger';
  count: number;
  children: React.ReactNode;
}

function SuggestionSection({
  title,
  subtitle,
  icon,
  accentColor,
  count,
  children,
}: SuggestionSectionProps) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <div
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full',
            accentColor === 'success' && 'bg-success-100 dark:bg-success-900/30',
            accentColor === 'warning' && 'bg-warning-100 dark:bg-warning-900/30',
            accentColor === 'danger' && 'bg-danger-100 dark:bg-danger-900/30'
          )}
        >
          {icon}
        </div>
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {title}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
              {count}
            </span>
          </h3>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
