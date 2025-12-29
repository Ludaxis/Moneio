'use client';

import { useFadeIn } from '@moneio/ui/hooks/use-gsap';
import { Bot, User, TrendingUp, TrendingDown, AlertCircle, CheckCircle2 } from 'lucide-react';
import type React from 'react';

interface DataPoint {
  label: string;
  value: number;
  formatted: string;
  percentage?: number;
}

interface ChatMessageProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: Date;
  metadata?: {
    queryType?: string;
    dataPoints?: DataPoint[];
    suggestions?: string[];
  };
  onSuggestionClick?: (suggestion: string) => void;
}

export function ChatMessage({
  role,
  content,
  timestamp,
  metadata,
  onSuggestionClick,
}: ChatMessageProps) {
  const containerRef = useFadeIn({
    duration: 0.3,
    y: 10,
  }) as React.RefObject<HTMLDivElement>;

  const isAssistant = role === 'assistant';

  // Parse status indicators from content
  const hasRunwayWarning = content.toLowerCase().includes('runway') &&
    (content.toLowerCase().includes('critical') || content.toLowerCase().includes('warning'));
  const isPositive = content.toLowerCase().includes('profitable') ||
    content.toLowerCase().includes('increased') ||
    content.toLowerCase().includes('healthy');

  return (
    <div
      ref={containerRef}
      className={`flex gap-3 ${isAssistant ? '' : 'flex-row-reverse'}`}
    >
      {/* Avatar */}
      <div
        className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${
          isAssistant
            ? 'bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300'
            : 'bg-muted text-muted-foreground'
        }`}
      >
        {isAssistant ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
      </div>

      {/* Message Content */}
      <div className={`flex-1 max-w-[80%] ${isAssistant ? '' : 'flex flex-col items-end'}`}>
        <div
          className={`rounded-2xl px-4 py-3 ${
            isAssistant
              ? 'bg-card border border-border rounded-tl-sm'
              : 'bg-primary-600 text-white rounded-tr-sm'
          }`}
        >
          {/* Status indicator for assistant messages */}
          {isAssistant && (hasRunwayWarning || isPositive) && (
            <div className={`flex items-center gap-1.5 mb-2 text-sm ${
              hasRunwayWarning ? 'text-danger-600' : 'text-success-600'
            }`}>
              {hasRunwayWarning ? (
                <AlertCircle className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <span className="font-medium">
                {hasRunwayWarning ? 'Attention Required' : 'Looking Good'}
              </span>
            </div>
          )}

          {/* Main content */}
          <p className={`text-sm whitespace-pre-wrap ${isAssistant ? 'text-foreground' : ''}`}>
            {content}
          </p>

          {/* Data Points Visualization */}
          {isAssistant && metadata?.dataPoints && metadata.dataPoints.length > 0 && (
            <div className="mt-4 space-y-2">
              {metadata.dataPoints.map((point, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2"
                >
                  <span className="text-sm text-muted-foreground">{point.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold tabular-nums text-foreground">
                      {point.formatted}
                    </span>
                    {point.percentage !== undefined && (
                      <span
                        className={`flex items-center text-xs ${
                          point.percentage >= 0 ? 'text-success-600' : 'text-danger-600'
                        }`}
                      >
                        {point.percentage >= 0 ? (
                          <TrendingUp className="h-3 w-3 mr-0.5" />
                        ) : (
                          <TrendingDown className="h-3 w-3 mr-0.5" />
                        )}
                        {Math.abs(point.percentage).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Timestamp */}
        {timestamp && (
          <p className="mt-1 text-xs text-muted-foreground px-2">
            {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}

        {/* Suggestions */}
        {isAssistant && metadata?.suggestions && metadata.suggestions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {metadata.suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => onSuggestionClick?.(suggestion)}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
