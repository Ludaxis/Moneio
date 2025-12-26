// Common validation schemas
import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const timestampSchema = z.string().datetime();

export const paginationSchema = z.object({
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

export const sortDirectionSchema = z.enum(['asc', 'desc']);

export const workspaceRoleSchema = z.enum(['owner', 'admin', 'member']);

export const supportedLocaleSchema = z.enum(['en', 'et', 'fa', 'ar']);

export const currencyCodeSchema = z.string().length(3).toUpperCase();

export const moneySchema = z.object({
  amount: z.number().int(),
  currency: currencyCodeSchema,
  decimalPlaces: z.number().int().min(0).max(4),
});

export const dateRangeSchema = z.object({
  start: z.string().date(),
  end: z.string().date(),
});

// Type exports
export type Pagination = z.infer<typeof paginationSchema>;
export type SortDirection = z.infer<typeof sortDirectionSchema>;
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
export type SupportedLocale = z.infer<typeof supportedLocaleSchema>;
export type MoneyInput = z.infer<typeof moneySchema>;
export type DateRange = z.infer<typeof dateRangeSchema>;
