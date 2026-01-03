'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

/**
 * Centralized category translation map
 * Maps English category names (from database) to translation keys
 *
 * This is the SINGLE SOURCE OF TRUTH for category name translations.
 * All components should use the useTranslateCategory hook instead of
 * maintaining their own mapping.
 */
const categoryKeyMap: Record<string, string> = {
  // Common categories
  'Internal Transfer': 'internalTransfer',
  'Salaries & Wages': 'salariesWages',
  Rent: 'rent',
  'Office Supplies': 'officeSupplies',
  'Software & Subscriptions': 'softwareSubscriptions',
  Utilities: 'utilities',
  Travel: 'travel',
  Marketing: 'marketing',
  'Food & Dining': 'foodDining',
  Transportation: 'transportation',
  Entertainment: 'entertainment',
  Healthcare: 'healthcare',
  Insurance: 'insurance',
  Taxes: 'taxes',
  'Professional Services': 'professionalServices',
  'Bank Fees': 'bankFees',
  Equipment: 'equipment',
  Inventory: 'inventory',
  'Revenue / Income': 'revenueIncome',
  Other: 'other',
  'Owner Draw': 'ownerDraw',
  'Travel & Entertainment': 'travelEntertainment',
  Meals: 'meals',
  Advertising: 'advertising',
  Legal: 'legal',
  Accounting: 'accounting',
  Consulting: 'consulting',
  'Education & Training': 'education',
  'Repairs & Maintenance': 'repairs',
  'Shipping & Delivery': 'shipping',
  Subscriptions: 'subscriptions',
  Telecommunications: 'telecommunications',
  Interest: 'interest',
  Depreciation: 'depreciation',
  Refunds: 'refunds',
  Sales: 'sales',
  Services: 'services',
  Grants: 'grants',
  Investments: 'investments',
  Loans: 'loans',
  Uncategorized: 'uncategorized',
  'Cost of Goods Sold': 'costOfGoodsSold',
  COGS: 'cogs',
  Payroll: 'payroll',
  'Contractor Payments': 'contractorPayments',
  'Office Rent': 'officeRent',
  'Web Hosting': 'webHosting',
  'Cloud Services': 'cloudServices',
  // Additional income/expense categories
  'Other Income': 'otherIncome',
  'Sales Revenue': 'salesRevenue',
  'Service Revenue': 'serviceRevenue',
  'Owner Investment': 'ownerInvestment',
  'Tax Payments': 'taxPayments',
  'Interest Income': 'interestIncome',
  'Marketing & Advertising': 'marketingAdvertising',
};

/**
 * Hook to translate category names from English (database) to current locale
 *
 * Usage:
 * ```tsx
 * const translateCategory = useTranslateCategory();
 * const translatedName = translateCategory('Office Supplies'); // Returns "لوازم اداری" in Persian
 * ```
 */
export function useTranslateCategory() {
  const tCategories = useTranslations('dashboard.categories');

  const translateCategory = useCallback(
    (categoryName: string | null | undefined): string => {
      if (!categoryName) return '';

      const key = categoryKeyMap[categoryName];
      if (key) {
        try {
          return tCategories(key);
        } catch {
          // If translation key doesn't exist, return original
          return categoryName;
        }
      }
      return categoryName;
    },
    [tCategories]
  );

  return translateCategory;
}

/**
 * Get translation key for a category name (for use in server components or non-hook contexts)
 */
export function getCategoryTranslationKey(categoryName: string): string | null {
  return categoryKeyMap[categoryName] || null;
}

/**
 * Check if a category name has a translation available
 */
export function hasCategoryTranslation(categoryName: string): boolean {
  return categoryName in categoryKeyMap;
}
