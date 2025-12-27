'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../utils.js';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-primary-100 text-primary-700 dark:bg-primary-900 dark:text-primary-300',
        secondary:
          'border-transparent bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
        success:
          'border-transparent bg-success-50 text-success-700 dark:bg-success-900 dark:text-success-300',
        warning:
          'border-transparent bg-warning-50 text-warning-700 dark:bg-warning-900 dark:text-warning-300',
        danger:
          'border-transparent bg-danger-50 text-danger-700 dark:bg-danger-900 dark:text-danger-300',
        outline: 'text-neutral-700 dark:text-neutral-300',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
