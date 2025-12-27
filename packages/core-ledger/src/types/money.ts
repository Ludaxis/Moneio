// Money and currency types

// ISO 4217 currency codes (subset of commonly used ones)
export type CurrencyCode =
  | 'USD'
  | 'EUR'
  | 'GBP'
  | 'CHF'
  | 'JPY'
  | 'CAD'
  | 'AUD'
  | 'NZD'
  | 'SEK'
  | 'NOK'
  | 'DKK'
  | 'PLN'
  | 'CZK'
  | 'HUF'
  | 'RON'
  | 'BGN'
  | 'HRK'
  | 'RUB'
  | 'UAH'
  | 'TRY'
  | 'ILS'
  | 'AED'
  | 'SAR'
  | 'IRR'
  | 'INR'
  | 'CNY'
  | 'KRW'
  | 'SGD'
  | 'HKD'
  | 'MYR'
  | 'THB'
  | 'IDR'
  | 'PHP'
  | 'VND'
  | 'BRL'
  | 'MXN'
  | 'ARS'
  | 'CLP'
  | 'COP'
  | 'PEN'
  | 'ZAR'
  | 'EGP'
  | 'NGN'
  | 'KES';

export interface CurrencyInfo {
  code: CurrencyCode;
  name: string;
  symbol: string;
  decimalPlaces: number;
  symbolPosition: 'before' | 'after';
}

// Money is stored as an integer in the smallest unit (cents, pence, etc.)
// with explicit decimal places for precision
export interface Money {
  amount: number; // Amount in smallest currency unit (e.g., cents)
  currency: CurrencyCode;
  decimalPlaces: number; // Number of decimal places (usually 2)
}

// FX rate
export interface FxRate {
  baseCurrency: CurrencyCode;
  quoteCurrency: CurrencyCode;
  rate: number;
  provider: string;
  fetchedAt: string;
}

// VAT/Tax
export interface VatAmount {
  rate: number; // e.g., 0.20 for 20%
  amount: Money;
  rateLabel?: string; // e.g., "Standard Rate", "Reduced Rate"
}

// Currency metadata
export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2, symbolPosition: 'before' },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', decimalPlaces: 2, symbolPosition: 'before' },
  GBP: {
    code: 'GBP',
    name: 'British Pound',
    symbol: '£',
    decimalPlaces: 2,
    symbolPosition: 'before',
  },
  CHF: {
    code: 'CHF',
    name: 'Swiss Franc',
    symbol: 'CHF',
    decimalPlaces: 2,
    symbolPosition: 'after',
  },
  JPY: {
    code: 'JPY',
    name: 'Japanese Yen',
    symbol: '¥',
    decimalPlaces: 0,
    symbolPosition: 'before',
  },
  CAD: {
    code: 'CAD',
    name: 'Canadian Dollar',
    symbol: 'CA$',
    decimalPlaces: 2,
    symbolPosition: 'before',
  },
  AUD: {
    code: 'AUD',
    name: 'Australian Dollar',
    symbol: 'A$',
    decimalPlaces: 2,
    symbolPosition: 'before',
  },
  NZD: {
    code: 'NZD',
    name: 'New Zealand Dollar',
    symbol: 'NZ$',
    decimalPlaces: 2,
    symbolPosition: 'before',
  },
  SEK: {
    code: 'SEK',
    name: 'Swedish Krona',
    symbol: 'kr',
    decimalPlaces: 2,
    symbolPosition: 'after',
  },
  NOK: {
    code: 'NOK',
    name: 'Norwegian Krone',
    symbol: 'kr',
    decimalPlaces: 2,
    symbolPosition: 'after',
  },
  DKK: {
    code: 'DKK',
    name: 'Danish Krone',
    symbol: 'kr',
    decimalPlaces: 2,
    symbolPosition: 'after',
  },
  PLN: {
    code: 'PLN',
    name: 'Polish Zloty',
    symbol: 'zł',
    decimalPlaces: 2,
    symbolPosition: 'after',
  },
  CZK: {
    code: 'CZK',
    name: 'Czech Koruna',
    symbol: 'Kč',
    decimalPlaces: 2,
    symbolPosition: 'after',
  },
  HUF: {
    code: 'HUF',
    name: 'Hungarian Forint',
    symbol: 'Ft',
    decimalPlaces: 0,
    symbolPosition: 'after',
  },
  RON: {
    code: 'RON',
    name: 'Romanian Leu',
    symbol: 'lei',
    decimalPlaces: 2,
    symbolPosition: 'after',
  },
  BGN: {
    code: 'BGN',
    name: 'Bulgarian Lev',
    symbol: 'лв',
    decimalPlaces: 2,
    symbolPosition: 'after',
  },
  HRK: {
    code: 'HRK',
    name: 'Croatian Kuna',
    symbol: 'kn',
    decimalPlaces: 2,
    symbolPosition: 'after',
  },
  RUB: {
    code: 'RUB',
    name: 'Russian Ruble',
    symbol: '₽',
    decimalPlaces: 2,
    symbolPosition: 'after',
  },
  UAH: {
    code: 'UAH',
    name: 'Ukrainian Hryvnia',
    symbol: '₴',
    decimalPlaces: 2,
    symbolPosition: 'after',
  },
  TRY: {
    code: 'TRY',
    name: 'Turkish Lira',
    symbol: '₺',
    decimalPlaces: 2,
    symbolPosition: 'before',
  },
  ILS: {
    code: 'ILS',
    name: 'Israeli Shekel',
    symbol: '₪',
    decimalPlaces: 2,
    symbolPosition: 'before',
  },
  AED: {
    code: 'AED',
    name: 'UAE Dirham',
    symbol: 'د.إ',
    decimalPlaces: 2,
    symbolPosition: 'after',
  },
  SAR: { code: 'SAR', name: 'Saudi Riyal', symbol: '﷼', decimalPlaces: 2, symbolPosition: 'after' },
  IRR: {
    code: 'IRR',
    name: 'Iranian Rial',
    symbol: '﷼',
    decimalPlaces: 0,
    symbolPosition: 'after',
  },
  INR: {
    code: 'INR',
    name: 'Indian Rupee',
    symbol: '₹',
    decimalPlaces: 2,
    symbolPosition: 'before',
  },
  CNY: {
    code: 'CNY',
    name: 'Chinese Yuan',
    symbol: '¥',
    decimalPlaces: 2,
    symbolPosition: 'before',
  },
  KRW: {
    code: 'KRW',
    name: 'South Korean Won',
    symbol: '₩',
    decimalPlaces: 0,
    symbolPosition: 'before',
  },
  SGD: {
    code: 'SGD',
    name: 'Singapore Dollar',
    symbol: 'S$',
    decimalPlaces: 2,
    symbolPosition: 'before',
  },
  HKD: {
    code: 'HKD',
    name: 'Hong Kong Dollar',
    symbol: 'HK$',
    decimalPlaces: 2,
    symbolPosition: 'before',
  },
  MYR: {
    code: 'MYR',
    name: 'Malaysian Ringgit',
    symbol: 'RM',
    decimalPlaces: 2,
    symbolPosition: 'before',
  },
  THB: { code: 'THB', name: 'Thai Baht', symbol: '฿', decimalPlaces: 2, symbolPosition: 'before' },
  IDR: {
    code: 'IDR',
    name: 'Indonesian Rupiah',
    symbol: 'Rp',
    decimalPlaces: 0,
    symbolPosition: 'before',
  },
  PHP: {
    code: 'PHP',
    name: 'Philippine Peso',
    symbol: '₱',
    decimalPlaces: 2,
    symbolPosition: 'before',
  },
  VND: {
    code: 'VND',
    name: 'Vietnamese Dong',
    symbol: '₫',
    decimalPlaces: 0,
    symbolPosition: 'after',
  },
  BRL: {
    code: 'BRL',
    name: 'Brazilian Real',
    symbol: 'R$',
    decimalPlaces: 2,
    symbolPosition: 'before',
  },
  MXN: {
    code: 'MXN',
    name: 'Mexican Peso',
    symbol: 'MX$',
    decimalPlaces: 2,
    symbolPosition: 'before',
  },
  ARS: {
    code: 'ARS',
    name: 'Argentine Peso',
    symbol: 'AR$',
    decimalPlaces: 2,
    symbolPosition: 'before',
  },
  CLP: {
    code: 'CLP',
    name: 'Chilean Peso',
    symbol: 'CL$',
    decimalPlaces: 0,
    symbolPosition: 'before',
  },
  COP: {
    code: 'COP',
    name: 'Colombian Peso',
    symbol: 'CO$',
    decimalPlaces: 0,
    symbolPosition: 'before',
  },
  PEN: {
    code: 'PEN',
    name: 'Peruvian Sol',
    symbol: 'S/',
    decimalPlaces: 2,
    symbolPosition: 'before',
  },
  ZAR: {
    code: 'ZAR',
    name: 'South African Rand',
    symbol: 'R',
    decimalPlaces: 2,
    symbolPosition: 'before',
  },
  EGP: {
    code: 'EGP',
    name: 'Egyptian Pound',
    symbol: 'E£',
    decimalPlaces: 2,
    symbolPosition: 'before',
  },
  NGN: {
    code: 'NGN',
    name: 'Nigerian Naira',
    symbol: '₦',
    decimalPlaces: 2,
    symbolPosition: 'before',
  },
  KES: {
    code: 'KES',
    name: 'Kenyan Shilling',
    symbol: 'KSh',
    decimalPlaces: 2,
    symbolPosition: 'before',
  },
};
