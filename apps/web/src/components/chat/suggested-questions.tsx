'use client';

import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Calendar,
  Receipt,
  PieChart,
  Clock,
  CreditCard,
} from 'lucide-react';

interface SuggestedQuestion {
  icon: React.ReactNode;
  text: string;
  category: 'spending' | 'income' | 'runway' | 'recurring';
}

const suggestions: SuggestedQuestion[] = [
  {
    icon: <TrendingDown className="h-4 w-4" />,
    text: 'How much did I spend this month?',
    category: 'spending',
  },
  {
    icon: <TrendingUp className="h-4 w-4" />,
    text: 'What was my total income this month?',
    category: 'income',
  },
  {
    icon: <Clock className="h-4 w-4" />,
    text: "What's my cash runway?",
    category: 'runway',
  },
  {
    icon: <Receipt className="h-4 w-4" />,
    text: 'Show my recurring expenses',
    category: 'recurring',
  },
  {
    icon: <Wallet className="h-4 w-4" />,
    text: 'Am I profitable this quarter?',
    category: 'income',
  },
  {
    icon: <PieChart className="h-4 w-4" />,
    text: 'Show spending by category',
    category: 'spending',
  },
  {
    icon: <CreditCard className="h-4 w-4" />,
    text: 'What are my largest expenses?',
    category: 'spending',
  },
  {
    icon: <Calendar className="h-4 w-4" />,
    text: 'Any pending invoices?',
    category: 'recurring',
  },
];

const categoryColors = {
  spending:
    'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-800 dark:hover:bg-rose-900',
  income:
    'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800 dark:hover:bg-emerald-900',
  runway:
    'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800 dark:hover:bg-amber-900',
  recurring:
    'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800 dark:hover:bg-violet-900',
};

interface SuggestedQuestionsProps {
  onSelect: (question: string) => void;
}

export function SuggestedQuestions({ onSelect }: SuggestedQuestionsProps) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-foreground">Ask your AI CFO</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Get instant insights about your finances
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {suggestions.map((suggestion, index) => (
          <button
            key={index}
            onClick={() => onSelect(suggestion.text)}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all ${categoryColors[suggestion.category]}`}
          >
            {suggestion.icon}
            <span>{suggestion.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
