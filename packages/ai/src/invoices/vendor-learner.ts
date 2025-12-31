/**
 * Vendor Learning System
 *
 * Learns from user corrections to improve future extractions:
 * - Remember vendor name patterns
 * - Remember default categories per vendor
 * - Remember tax rates per vendor
 * - Detect recurring invoices
 */

/**
 * Learned vendor information
 */
export interface LearnedVendor {
  id: string;
  name: string;
  normalizedName: string;
  patterns: string[]; // Patterns to match this vendor
  defaultCategoryId?: string;
  defaultCategoryName?: string;
  typicalTaxRate?: number;
  typicalCurrency?: string;
  invoiceCount: number;
  lastSeenAt: Date;
  totalAmount: number;
  averageAmount: number;
  isRecurring: boolean;
  recurringPeriod?: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  metadata?: Record<string, unknown>;
}

/**
 * Invoice correction from user
 */
export interface InvoiceCorrection {
  vendorName: string;
  correctedVendorName?: string;
  categoryId?: string;
  categoryName?: string;
  taxRate?: number;
  currency?: string;
  amount?: number;
  date?: Date;
}

/**
 * Vendor learning storage interface
 */
export interface VendorLearningStore {
  getVendor(normalizedName: string, workspaceId: string): Promise<LearnedVendor | null>;
  findVendorByPattern(text: string, workspaceId: string): Promise<LearnedVendor | null>;
  saveVendor(vendor: LearnedVendor, workspaceId: string): Promise<void>;
  getAllVendors(workspaceId: string): Promise<LearnedVendor[]>;
  deleteVendor(vendorId: string, workspaceId: string): Promise<void>;
}

/**
 * In-memory vendor learning store
 */
export class InMemoryVendorStore implements VendorLearningStore {
  private vendors: Map<string, Map<string, LearnedVendor>> = new Map(); // workspaceId -> normalizedName -> vendor

  async getVendor(normalizedName: string, workspaceId: string): Promise<LearnedVendor | null> {
    const workspaceVendors = this.vendors.get(workspaceId);
    return workspaceVendors?.get(normalizedName) ?? null;
  }

  async findVendorByPattern(text: string, workspaceId: string): Promise<LearnedVendor | null> {
    const workspaceVendors = this.vendors.get(workspaceId);
    if (!workspaceVendors) return null;

    const textLower = text.toLowerCase();
    for (const vendor of workspaceVendors.values()) {
      for (const pattern of vendor.patterns) {
        if (textLower.includes(pattern.toLowerCase())) {
          return vendor;
        }
      }
    }
    return null;
  }

  async saveVendor(vendor: LearnedVendor, workspaceId: string): Promise<void> {
    if (!this.vendors.has(workspaceId)) {
      this.vendors.set(workspaceId, new Map());
    }
    this.vendors.get(workspaceId)!.set(vendor.normalizedName, vendor);
  }

  async getAllVendors(workspaceId: string): Promise<LearnedVendor[]> {
    const workspaceVendors = this.vendors.get(workspaceId);
    return workspaceVendors ? Array.from(workspaceVendors.values()) : [];
  }

  async deleteVendor(vendorId: string, workspaceId: string): Promise<void> {
    const workspaceVendors = this.vendors.get(workspaceId);
    if (workspaceVendors) {
      for (const [key, vendor] of workspaceVendors) {
        if (vendor.id === vendorId) {
          workspaceVendors.delete(key);
          break;
        }
      }
    }
  }
}

/**
 * Vendor Learner
 */
export class VendorLearner {
  constructor(private readonly store: VendorLearningStore) {}

  /**
   * Normalize vendor name for matching
   */
  private normalizeVendorName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove special chars
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\b(ltd|llc|inc|corp|gmbh|oü|as|oy|ab|bv|sa|srl)\b/gi, '') // Remove suffixes
      .trim();
  }

  /**
   * Extract patterns from vendor name
   */
  private extractPatterns(name: string): string[] {
    const normalized = this.normalizeVendorName(name);
    const words = normalized.split(' ').filter((w) => w.length > 2);

    // Create patterns:
    // 1. Full normalized name
    // 2. First N words (for long names)
    // 3. Significant words (longer than 4 chars)
    const patterns = [normalized];

    if (words.length > 2) {
      patterns.push(words.slice(0, 2).join(' '));
    }

    const significantWords = words.filter((w) => w.length > 4);
    if (significantWords.length > 0) {
      patterns.push(...significantWords);
    }

    return [...new Set(patterns)];
  }

  /**
   * Learn from an invoice extraction and optional correction
   */
  async learnFromInvoice(
    workspaceId: string,
    extraction: {
      vendorName: string;
      categoryId?: string;
      categoryName?: string;
      taxRate?: number;
      currency?: string;
      amount?: number;
      date?: Date;
    },
    correction?: InvoiceCorrection
  ): Promise<LearnedVendor> {
    const vendorName = correction?.correctedVendorName || extraction.vendorName;
    const normalizedName = this.normalizeVendorName(vendorName);

    // Get existing vendor or create new
    let vendor = await this.store.getVendor(normalizedName, workspaceId);

    if (vendor) {
      // Update existing vendor
      vendor = this.updateVendor(vendor, extraction, correction);
    } else {
      // Create new vendor
      vendor = {
        id: crypto.randomUUID(),
        name: vendorName,
        normalizedName,
        patterns: this.extractPatterns(vendorName),
        defaultCategoryId: correction?.categoryId || extraction.categoryId,
        defaultCategoryName: correction?.categoryName || extraction.categoryName,
        typicalTaxRate: correction?.taxRate || extraction.taxRate,
        typicalCurrency: correction?.currency || extraction.currency,
        invoiceCount: 1,
        lastSeenAt: new Date(),
        totalAmount: extraction.amount || 0,
        averageAmount: extraction.amount || 0,
        isRecurring: false,
      };
    }

    await this.store.saveVendor(vendor, workspaceId);
    return vendor;
  }

  /**
   * Update vendor with new invoice data
   */
  private updateVendor(
    vendor: LearnedVendor,
    extraction: {
      categoryId?: string;
      categoryName?: string;
      taxRate?: number;
      currency?: string;
      amount?: number;
      date?: Date;
    },
    correction?: InvoiceCorrection
  ): LearnedVendor {
    const newCount = vendor.invoiceCount + 1;
    const newTotal = vendor.totalAmount + (extraction.amount || 0);

    const updated: LearnedVendor = {
      ...vendor,
      invoiceCount: newCount,
      lastSeenAt: new Date(),
      totalAmount: newTotal,
      averageAmount: newTotal / newCount,
    };

    // Update category if corrected or if we don't have one
    if (correction?.categoryId || (!vendor.defaultCategoryId && extraction.categoryId)) {
      updated.defaultCategoryId = correction?.categoryId || extraction.categoryId;
      updated.defaultCategoryName = correction?.categoryName || extraction.categoryName;
    }

    // Update tax rate if consistent
    if (correction?.taxRate !== undefined) {
      updated.typicalTaxRate = correction.taxRate;
    } else if (extraction.taxRate && !vendor.typicalTaxRate) {
      updated.typicalTaxRate = extraction.taxRate;
    }

    // Check for recurring pattern
    if (newCount >= 2) {
      updated.isRecurring = true;
      // Could analyze dates to determine period
    }

    return updated;
  }

  /**
   * Find vendor by name pattern
   */
  async findVendor(workspaceId: string, vendorNameOrText: string): Promise<LearnedVendor | null> {
    const normalized = this.normalizeVendorName(vendorNameOrText);

    // Try exact match first
    const exactMatch = await this.store.getVendor(normalized, workspaceId);
    if (exactMatch) return exactMatch;

    // Try pattern match
    return this.store.findVendorByPattern(vendorNameOrText, workspaceId);
  }

  /**
   * Get suggestions for a vendor name
   */
  async getSuggestions(
    workspaceId: string,
    vendorName: string
  ): Promise<{
    categoryId?: string;
    categoryName?: string;
    taxRate?: number;
    currency?: string;
    isRecurring: boolean;
    confidence: number;
  } | null> {
    const vendor = await this.findVendor(workspaceId, vendorName);
    if (!vendor) return null;

    // Higher confidence for vendors with more history
    const baseConfidence = 70;
    const historyBonus = Math.min(20, vendor.invoiceCount * 5);
    const confidence = baseConfidence + historyBonus;

    return {
      categoryId: vendor.defaultCategoryId,
      categoryName: vendor.defaultCategoryName,
      taxRate: vendor.typicalTaxRate,
      currency: vendor.typicalCurrency,
      isRecurring: vendor.isRecurring,
      confidence,
    };
  }

  /**
   * Get all recurring vendors
   */
  async getRecurringVendors(workspaceId: string): Promise<LearnedVendor[]> {
    const all = await this.store.getAllVendors(workspaceId);
    return all.filter((v) => v.isRecurring);
  }

  /**
   * Get top vendors by invoice count
   */
  async getTopVendors(workspaceId: string, limit: number = 10): Promise<LearnedVendor[]> {
    const all = await this.store.getAllVendors(workspaceId);
    return all.sort((a, b) => b.invoiceCount - a.invoiceCount).slice(0, limit);
  }

  /**
   * Get vendor statistics
   */
  async getStats(workspaceId: string): Promise<{
    totalVendors: number;
    recurringVendors: number;
    totalInvoices: number;
    totalAmount: number;
    topCategories: Array<{ categoryId: string; categoryName: string; count: number }>;
  }> {
    const all = await this.store.getAllVendors(workspaceId);

    const categoryCount = new Map<string, { name: string; count: number }>();
    let totalInvoices = 0;
    let totalAmount = 0;

    for (const vendor of all) {
      totalInvoices += vendor.invoiceCount;
      totalAmount += vendor.totalAmount;

      if (vendor.defaultCategoryId) {
        const existing = categoryCount.get(vendor.defaultCategoryId);
        if (existing) {
          existing.count += vendor.invoiceCount;
        } else {
          categoryCount.set(vendor.defaultCategoryId, {
            name: vendor.defaultCategoryName || 'Unknown',
            count: vendor.invoiceCount,
          });
        }
      }
    }

    const topCategories = Array.from(categoryCount.entries())
      .map(([categoryId, { name, count }]) => ({ categoryId, categoryName: name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalVendors: all.length,
      recurringVendors: all.filter((v) => v.isRecurring).length,
      totalInvoices,
      totalAmount,
      topCategories,
    };
  }
}

/**
 * Create vendor learner with in-memory store
 */
export function createVendorLearner(store?: VendorLearningStore): VendorLearner {
  return new VendorLearner(store || new InMemoryVendorStore());
}
