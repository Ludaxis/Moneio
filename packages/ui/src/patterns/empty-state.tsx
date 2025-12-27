'use client';

import * as React from 'react';
import { cn } from '../utils.js';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center py-12 text-center',
      className
    )}>
      {icon && (
        <div className="mb-4 rounded-full bg-neutral-100 p-4 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium text-neutral-900 dark:text-neutral-50">
        {title}
      </h3>
      {description && (
        <p className="mt-2 max-w-sm text-sm text-neutral-600 dark:text-neutral-400">
          {description}
        </p>
      )}
      {action && (
        <div className="mt-6">
          {action}
        </div>
      )}
    </div>
  );
}
