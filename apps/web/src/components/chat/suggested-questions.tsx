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
  AlertTriangle,
  PiggyBank,
  Lightbulb,
  FileText,
} from 'lucide-react';

interface SuggestedQuestion {
  icon: React.ReactNode;
  text: string;
  category: 'spending' | 'income' | 'runway' | 'recurring' | 'insights' | 'invoices';
}

const suggestions: SuggestedQuestion[] = [
  // AI-first insights (prioritized)
  {
    icon: <AlertTriangle className="h-4 w-4" />,
    text: 'Where is my money leaking?',
    category: 'insights',
  },
  {
    icon: <PiggyBank className="h-4 w-4" />,
    text: 'What subscriptions am I paying for?',
    category: 'insights',
  },
  {
    icon: <Lightbulb className="h-4 w-4" />,
    text: 'How can I save money?',
    category: 'insights',
  },
  {
    icon: <TrendingDown className="h-4 w-4" />,
    text: 'Am I spending more than usual?',
    category: 'spending',
  },
  // Standard queries
  {
    icon: <Clock className="h-4 w-4" />,
    text: "What's my cash runway?",
    category: 'runway',
  },
  {
    icon: <TrendingUp className="h-4 w-4" />,
    text: 'Am I profitable this month?',
    category: 'income',
  },
  {
    icon: <FileText className="h-4 w-4" />,
    text: 'What invoices are overdue?',
    category: 'invoices',
  },
  {
    icon: <Receipt className="h-4 w-4" />,
    text: 'Show my recurring expenses',
    category: 'recurring',
  },
  {
    icon: <PieChart className="h-4 w-4" />,
    text: 'Where is my money going?',
    category: 'spending',
  },
  {
    icon: <CreditCard className="h-4 w-4" />,
    text: 'What are my biggest expenses?',
    category: 'spending',
  },
  {
    icon: <Wallet className="h-4 w-4" />,
    text: 'How much did I spend this month?',
    category: 'spending',
  },
  {
    icon: <Calendar className="h-4 w-4" />,
    text: 'What is my total income?',
    category: 'income',
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
  insights:
    'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800 dark:hover:bg-blue-900',
  invoices:
    'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800 dark:hover:bg-orange-900',
};

interface SuggestedQuestionsProps {
  onSelect: (question: string) => void;
}

export function SuggestedQuestions({ onSelect }: SuggestedQuestionsProps) {
  // Show first 8 suggestions (prioritizes AI-first insights)
  const displayedSuggestions = suggestions.slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold text-foreground">Ask your AI CFO</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Get instant insights about your finances
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {displayedSuggestions.map((suggestion, index) => (
          <button
            key={index}
            onClick={() => onSelect(suggestion.text)}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-start text-sm font-medium transition-all ${categoryColors[suggestion.category]}`}
          >
            {suggestion.icon}
            <span>{suggestion.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
