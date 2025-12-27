'use client';

import * as React from 'react';

import { cn } from '../utils.js';

interface Column<T> {
  key: string;
  header: string | React.ReactNode;
  cell: (row: T, index: number) => React.ReactNode;
  className?: string;
  headerClassName?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (row: T, index: number) => string;
  onRowClick?: (row: T, index: number) => void;
  emptyState?: React.ReactNode;
  loading?: boolean;
  className?: string;
}

export function DataTable<T>({
  data,
  columns,
  keyExtractor,
  onRowClick,
  emptyState,
  loading,
  className,
}: DataTableProps<T>) {
  if (!loading && data.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full">
        <thead>
          <tr className="border-b border-neutral-200 dark:border-neutral-700">
            {columns.map((column) => (
              <th
                key={column.key}
                className={cn(
                  'px-4 py-3 text-left text-sm font-medium text-neutral-600 dark:text-neutral-400',
                  column.headerClassName
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 5 }).map((_, idx) => (
                <tr key={idx} className="border-b border-neutral-100 dark:border-neutral-800">
                  {columns.map((column) => (
                    <td key={column.key} className="px-4 py-3">
                      <div className="h-5 w-full animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
                    </td>
                  ))}
                </tr>
              ))
            : data.map((row, rowIndex) => (
                <tr
                  key={keyExtractor(row, rowIndex)}
                  onClick={() => onRowClick?.(row, rowIndex)}
                  className={cn(
                    'border-b border-neutral-100 transition-colors dark:border-neutral-800',
                    onRowClick && 'cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        'px-4 py-3 text-sm text-neutral-900 dark:text-neutral-100',
                        column.className
                      )}
                    >
                      {column.cell(row, rowIndex)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
