/**
 * Money Serialization Utilities
 *
 * Ensures consistent handling of monetary values in API responses.
 * Uses string representation to preserve precision for large amounts.
 *
 * Why strings?
 * - JavaScript numbers lose precision beyond 15 significant digits
 * - Prisma Decimal(15,2) can store up to 13 integer digits + 2 decimal places
 * - String representation is safe for any amount and works with BigInt on frontend
 */

import type { Prisma } from '@moneio/db';

/**
 * Serialized money value for API responses
 */
export interface SerializedMoney {
  /** String representation preserving full precision */
  value: string;
  /** Currency code (ISO 4217) */
  currency: string;
}

/**
 * Convert Prisma Decimal to string for API response
 * Preserves full precision without JavaScript number conversion
 *
 * @param decimal - Prisma Decimal value
 * @returns String representation of the decimal
 */
export function serializeDecimal(decimal: Prisma.Decimal | null | undefined): string | null {
  if (decimal === null || decimal === undefined) {
    return null;
  }
  return decimal.toString();
}

/**
 * Convert Prisma Decimal to string, defaulting to "0" for null/undefined
 *
 * @param decimal - Prisma Decimal value
 * @returns String representation, never null
 */
export function serializeDecimalRequired(decimal: Prisma.Decimal | null | undefined): string {
  if (decimal === null || decimal === undefined) {
    return '0';
  }
  return decimal.toString();
}

/**
 * Serialize a money amount with its currency
 *
 * @param amount - Prisma Decimal amount
 * @param currency - Currency code
 * @returns Serialized money object
 */
export function serializeMoney(
  amount: Prisma.Decimal | null | undefined,
  currency: string
): SerializedMoney {
  return {
    value: serializeDecimalRequired(amount),
    currency,
  };
}

/**
 * Serialize transaction amounts for API response
 */
export function serializeTransactionAmounts(
  amount: Prisma.Decimal,
  balance: Prisma.Decimal | null,
  currency: string
) {
  return {
    amount: serializeDecimalRequired(amount),
    balance: serializeDecimal(balance),
    currency,
  };
}

/**
 * Serialize invoice amounts for API response
 */
export function serializeInvoiceAmounts(
  subtotal: Prisma.Decimal,
  vatAmount: Prisma.Decimal,
  total: Prisma.Decimal,
  vatRate: Prisma.Decimal | null,
  currency: string
) {
  return {
    subtotal: serializeDecimalRequired(subtotal),
    vatAmount: serializeDecimalRequired(vatAmount),
    total: serializeDecimalRequired(total),
    vatRate: serializeDecimal(vatRate),
    currency,
  };
}

/**
 * Serialize line item amounts for API response
 */
export function serializeLineItemAmounts(
  quantity: Prisma.Decimal,
  unitPrice: Prisma.Decimal,
  amount: Prisma.Decimal,
  vatRate: Prisma.Decimal | null
) {
  return {
    quantity: serializeDecimalRequired(quantity),
    unitPrice: serializeDecimalRequired(unitPrice),
    amount: serializeDecimalRequired(amount),
    vatRate: serializeDecimal(vatRate),
  };
}
