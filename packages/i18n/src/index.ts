// i18n configuration and utilities
export const locales = ['en', 'et', 'fa', 'ar'] as const;
export type Locale = (typeof locales)[number];

export const rtlLocales: Locale[] = ['fa', 'ar'];

export const localeNames: Record<Locale, string> = {
  en: 'English',
  et: 'Eesti',
  fa: 'فارسی',
  ar: 'العربية',
};

export const defaultLocale: Locale = 'en';

export function isRtl(locale: Locale): boolean {
  return rtlLocales.includes(locale);
}

export function getDirection(locale: Locale): 'ltr' | 'rtl' {
  return isRtl(locale) ? 'rtl' : 'ltr';
}

// Number formatting
export function formatNumber(
  value: number,
  locale: Locale,
  options?: Intl.NumberFormatOptions
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

// Currency formatting
export function formatCurrency(
  amount: number,
  currency: string,
  locale: Locale
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Date formatting
export function formatDate(
  date: Date | string,
  locale: Locale,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  }).format(d);
}

// Relative time formatting
export function formatRelativeTime(
  date: Date | string,
  locale: Locale
): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMinutes = Math.floor(diffMs / (1000 * 60));
      return rtf.format(-diffMinutes, 'minute');
    }
    return rtf.format(-diffHours, 'hour');
  }

  if (diffDays < 30) {
    return rtf.format(-diffDays, 'day');
  }

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return rtf.format(-diffMonths, 'month');
  }

  const diffYears = Math.floor(diffDays / 365);
  return rtf.format(-diffYears, 'year');
}

// Message type for type-safe translations
export interface Messages {
  common: {
    appName: string;
    loading: string;
    error: string;
    success: string;
    cancel: string;
    save: string;
    delete: string;
    edit: string;
    create: string;
    search: string;
    filter: string;
    export: string;
    import: string;
    refresh: string;
    back: string;
    next: string;
    previous: string;
    submit: string;
    confirm: string;
    close: string;
    yes: string;
    no: string;
  };
  auth: {
    signIn: string;
    signOut: string;
    signUp: string;
    email: string;
    password: string;
    forgotPassword: string;
    resetPassword: string;
    magicLink: string;
    checkEmail: string;
  };
  workspace: {
    title: string;
    create: string;
    name: string;
    baseCurrency: string;
    members: string;
    settings: string;
    switch: string;
  };
  nav: {
    dashboard: string;
    documents: string;
    transactions: string;
    invoices: string;
    reports: string;
    chat: string;
    settings: string;
  };
  documents: {
    title: string;
    upload: string;
    dragDrop: string;
    processing: string;
    ready: string;
    failed: string;
    type: string;
    invoice: string;
    receipt: string;
    statement: string;
    other: string;
    noDocuments: string;
    uploadFirst: string;
  };
  transactions: {
    title: string;
    import: string;
    amount: string;
    date: string;
    description: string;
    category: string;
    uncategorized: string;
    reconciled: string;
    noTransactions: string;
    importCsv: string;
  };
  invoices: {
    title: string;
    number: string;
    vendor: string;
    issueDate: string;
    dueDate: string;
    total: string;
    vat: string;
    status: string;
    draft: string;
    approved: string;
    paid: string;
    void: string;
    lineItems: string;
    approve: string;
    review: string;
  };
  categories: {
    title: string;
    income: string;
    expense: string;
    transfer: string;
    suggested: string;
    accept: string;
    reject: string;
    bulkAccept: string;
  };
  reports: {
    title: string;
    cashflow: string;
    vat: string;
    profitLoss: string;
    period: string;
    thisMonth: string;
    lastMonth: string;
    thisQuarter: string;
    thisYear: string;
    custom: string;
    moneyIn: string;
    moneyOut: string;
    netChange: string;
    vatCollected: string;
    vatPaid: string;
    netVat: string;
  };
  chat: {
    title: string;
    placeholder: string;
    askAnything: string;
    citations: string;
    followUp: string;
    thinking: string;
  };
  dashboard: {
    title: string;
    welcome: string;
    overview: string;
    recentDocuments: string;
    recentTransactions: string;
    pendingReview: string;
    burnRate: string;
    topMerchants: string;
    categoryBreakdown: string;
  };
}
