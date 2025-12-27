'use client';

import { Check } from 'lucide-react';

import { cn } from '../utils.js';

interface Step {
  id: string;
  title: string;
  description?: string;
}

interface StepperProps {
  steps: Step[];
  currentStep: number;
  className?: string;
}

export function Stepper({ steps, currentStep, className }: StepperProps) {
  return (
    <nav className={cn('', className)} aria-label="Progress">
      <ol className="flex items-center">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isCurrent = index === currentStep;

          return (
            <li
              key={step.id}
              className={cn(
                'relative',
                index !== steps.length - 1 && 'flex-1 pr-8 sm:pr-20'
              )}
            >
              <div className="flex items-center">
                <div
                  className={cn(
                    'relative flex h-8 w-8 items-center justify-center rounded-full border-2 text-sm font-medium',
                    isCompleted
                      ? 'border-primary-600 bg-primary-600 text-white'
                      : isCurrent
                      ? 'border-primary-600 bg-white text-primary-600 dark:bg-neutral-900'
                      : 'border-neutral-300 bg-white text-neutral-500 dark:border-neutral-600 dark:bg-neutral-800'
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>
                {index !== steps.length - 1 && (
                  <div
                    className={cn(
                      'absolute left-8 top-4 h-0.5 w-full -translate-y-1/2',
                      isCompleted ? 'bg-primary-600' : 'bg-neutral-200 dark:bg-neutral-700'
                    )}
                  />
                )}
              </div>
              <div className="mt-2">
                <span
                  className={cn(
                    'text-sm font-medium',
                    isCurrent || isCompleted
                      ? 'text-neutral-900 dark:text-neutral-50'
                      : 'text-neutral-500 dark:text-neutral-400'
                  )}
                >
                  {step.title}
                </span>
                {step.description && (
                  <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                    {step.description}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
