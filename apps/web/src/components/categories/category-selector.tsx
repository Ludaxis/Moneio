'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@moneio/ui/primitives';
import { Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';

import { ConfidenceDot } from '@/components/ai';

interface Category {
  id: string;
  name: string;
  parentId: string | null;
}

interface CategorySelectorProps {
  workspaceId: string;
  value?: string;
  suggestedId?: string;
  suggestedName?: string;
  suggestedConfidence?: number;
  onChange: (categoryId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * Category Selector with AI suggestion indicator
 *
 * Shows a dropdown of all workspace categories with optional
 * AI suggestion highlighted at the top.
 */
export function CategorySelector({
  workspaceId,
  value,
  suggestedId,
  suggestedName,
  suggestedConfidence,
  onChange,
  disabled,
  placeholder = 'Select category...',
  className,
}: CategorySelectorProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCategories() {
      try {
        // Fetch all categories (max 100 per API limit)
        const response = await fetch(`/api/categories?workspaceId=${workspaceId}&pageSize=100`);
        if (response.ok) {
          const data = await response.json();
          setCategories(data.categories || []);
        }
      } catch (error) {
        console.error('Failed to fetch categories:', error);
      } finally {
        setLoading(false);
      }
    }

    if (workspaceId) {
      fetchCategories();
    } else {
      setLoading(false);
    }
  }, [workspaceId]);

  // Determine if AI suggestion is currently selected
  const isAiSelected = value === suggestedId;

  return (
    <Select value={value || ''} onValueChange={onChange} disabled={disabled || loading}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={loading ? 'Loading...' : placeholder}>
          {value && (
            <span className="flex items-center gap-2">
              {isAiSelected && suggestedConfidence !== undefined && (
                <ConfidenceDot confidence={suggestedConfidence} />
              )}
              {categories.find((c) => c.id === value)?.name || suggestedName || 'Unknown'}
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {/* AI Suggestion at top if available */}
        {suggestedId && suggestedName && (
          <>
            <SelectItem value={suggestedId} className="bg-primary/5">
              <span className="flex items-center gap-2">
                <Sparkles className="h-3 w-3 text-primary" />
                <span>{suggestedName}</span>
                {suggestedConfidence !== undefined && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {Math.round(suggestedConfidence)}%
                  </span>
                )}
              </span>
            </SelectItem>
            <div className="my-1 h-px bg-border" />
          </>
        )}

        {/* Empty state */}
        {categories.length === 0 && !suggestedId && (
          <div className="px-2 py-4 text-center text-sm text-muted-foreground">
            No categories found.
            <br />
            <span className="text-xs">Create categories in Settings.</span>
          </div>
        )}

        {/* All categories */}
        {categories
          .filter((cat) => !cat.parentId) // Top-level categories first
          .map((category) => (
            <SelectItem
              key={category.id}
              value={category.id}
              disabled={category.id === suggestedId}
            >
              {category.name}
            </SelectItem>
          ))}

        {/* Child categories with indent */}
        {categories
          .filter((cat) => cat.parentId)
          .map((category) => {
            const parent = categories.find((c) => c.id === category.parentId);
            return (
              <SelectItem
                key={category.id}
                value={category.id}
                disabled={category.id === suggestedId}
                className="pl-6"
              >
                {parent ? `${parent.name} › ${category.name}` : category.name}
              </SelectItem>
            );
          })}
      </SelectContent>
    </Select>
  );
}
