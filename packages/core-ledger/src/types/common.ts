// Common types used across the application

export type UUID = string;

export type Timestamp = string; // ISO 8601 format

export interface Identifiable {
  id: UUID;
}

export interface WorkspaceScoped {
  workspaceId: UUID;
}

export interface Timestamped {
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface SoftDeletable {
  deletedAt?: Timestamp;
}

export type EntityBase = Identifiable & WorkspaceScoped & Timestamped;

// Pagination
export interface PaginationParams {
  limit: number;
  offset: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// Sorting
export type SortDirection = 'asc' | 'desc';

export interface SortParams<T extends string = string> {
  field: T;
  direction: SortDirection;
}

// User roles
export type WorkspaceRole = 'owner' | 'admin' | 'member';

// Locales
export type SupportedLocale = 'en' | 'et' | 'fa' | 'ar';

export type TextDirection = 'ltr' | 'rtl';

export const LOCALE_DIRECTIONS: Record<SupportedLocale, TextDirection> = {
  en: 'ltr',
  et: 'ltr',
  fa: 'rtl',
  ar: 'rtl',
};
