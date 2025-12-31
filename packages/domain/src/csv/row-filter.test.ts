import { describe, it, expect } from 'vitest';

import {
  RowFilter,
  createRowFilter,
  isTurnoverDescription,
  DEFAULT_TURNOVER_KEYWORDS,
  getDefaultExclusionConfig,
} from './row-filter';

describe('RowFilter', () => {
  describe('createRowFilter', () => {
    it('creates a filter with default config', () => {
      const filter = createRowFilter();
      expect(filter).toBeInstanceOf(RowFilter);
    });

    it('creates a filter with custom config', () => {
      const filter = createRowFilter({
        turnoverKeywords: ['custom keyword'],
        excludeZeroAmount: false,
      });
      expect(filter).toBeInstanceOf(RowFilter);
    });
  });

  describe('isExcluded', () => {
    const filter = createRowFilter();

    it('excludes rows with turnover keywords in description', () => {
      const result = filter.isExcluded({
        description: 'Opening Balance for January',
        amount: 1000,
      });

      expect(result.excluded).toBe(true);
      expect(result.category).toBe('turnover');
    });

    it('excludes rows with closing balance', () => {
      const result = filter.isExcluded({
        description: 'Closing Balance',
        amount: 5000,
      });

      expect(result.excluded).toBe(true);
      expect(result.category).toBe('turnover');
    });

    it('excludes rows with zero amount by default', () => {
      const result = filter.isExcluded({
        description: 'Some transaction',
        amount: 0,
      });

      expect(result.excluded).toBe(true);
      expect(result.category).toBe('zero_amount');
    });

    it('excludes rows with missing amount by default', () => {
      const result = filter.isExcluded({
        description: 'Some transaction',
        amount: null,
      });

      expect(result.excluded).toBe(true);
      expect(result.category).toBe('missing_amount');
    });

    it('excludes rows with cancelled status', () => {
      const result = filter.isExcluded({
        description: 'Payment to vendor',
        amount: 100,
        status: 'CANCELLED',
      });

      expect(result.excluded).toBe(true);
      expect(result.category).toBe('status');
    });

    it('excludes rows with refunded status', () => {
      const result = filter.isExcluded({
        description: 'Payment to vendor',
        amount: 100,
        status: 'refunded',
      });

      expect(result.excluded).toBe(true);
      expect(result.category).toBe('status');
    });

    it('includes valid transactions', () => {
      const result = filter.isExcluded({
        description: 'Payment to Acme Corp',
        amount: 250.5,
      });

      expect(result.excluded).toBe(false);
    });

    it('includes transactions with completed status', () => {
      const result = filter.isExcluded({
        description: 'Payment to vendor',
        amount: 100,
        status: 'completed',
      });

      expect(result.excluded).toBe(false);
    });

    it('handles amount as string', () => {
      const result = filter.isExcluded({
        description: 'Payment',
        amount: '100.50',
      });

      expect(result.excluded).toBe(false);
    });

    it('handles European amount format', () => {
      const result = filter.isExcluded({
        description: 'Payment',
        amount: '1.234,56',
      });

      expect(result.excluded).toBe(false);
    });

    it('excludes rows matching exclusion patterns', () => {
      const result = filter.isExcluded({
        description: '  balance  ',
        amount: 1000,
      });

      expect(result.excluded).toBe(true);
      expect(result.category).toBe('pattern_match');
    });

    it('excludes German turnover keywords', () => {
      const result = filter.isExcluded({
        description: 'Anfangssaldo zum 01.01.2024',
        amount: 5000,
      });

      expect(result.excluded).toBe(true);
      expect(result.category).toBe('turnover');
    });

    it('excludes Estonian turnover keywords', () => {
      const result = filter.isExcluded({
        description: 'Algsaldo',
        amount: 3000,
      });

      expect(result.excluded).toBe(true);
      expect(result.category).toBe('turnover');
    });
  });

  describe('filterRows', () => {
    const filter = createRowFilter();

    it('separates included and excluded rows', () => {
      const rows = [
        { description: 'Payment to vendor', amount: 100 },
        { description: 'Opening Balance', amount: 5000 },
        { description: 'Salary received', amount: 3000 },
        { description: 'Closing Balance', amount: 8000 },
      ];

      const { included, excluded } = filter.filterRows(rows);

      expect(included).toHaveLength(2);
      expect(excluded).toHaveLength(2);
      expect(included[0].description).toBe('Payment to vendor');
      expect(included[1].description).toBe('Salary received');
    });

    it('returns all rows when none are excluded', () => {
      const rows = [
        { description: 'Payment 1', amount: 100 },
        { description: 'Payment 2', amount: 200 },
      ];

      const { included, excluded } = filter.filterRows(rows);

      expect(included).toHaveLength(2);
      expect(excluded).toHaveLength(0);
    });
  });

  describe('custom filter configuration', () => {
    it('allows zero amounts when configured', () => {
      const filter = createRowFilter({ excludeZeroAmount: false });

      const result = filter.isExcluded({
        description: 'Zero value entry',
        amount: 0,
      });

      expect(result.excluded).toBe(false);
    });

    it('allows missing amounts when configured', () => {
      const filter = createRowFilter({ excludeMissingAmount: false });

      const result = filter.isExcluded({
        description: 'Entry without amount',
        amount: null,
      });

      expect(result.excluded).toBe(false);
    });

    it('uses custom turnover keywords', () => {
      const filter = createRowFilter({
        turnoverKeywords: ['my custom keyword'],
      });

      const result = filter.isExcluded({
        description: 'Row with my custom keyword here',
        amount: 100,
      });

      expect(result.excluded).toBe(true);
      expect(result.category).toBe('turnover');
    });
  });
});

describe('isTurnoverDescription', () => {
  it('detects opening balance', () => {
    expect(isTurnoverDescription('Opening Balance')).toBe(true);
  });

  it('detects closing balance', () => {
    expect(isTurnoverDescription('Closing Balance for period')).toBe(true);
  });

  it('detects total rows', () => {
    expect(isTurnoverDescription('Total')).toBe(true);
    expect(isTurnoverDescription('Subtotal')).toBe(true);
  });

  it('returns false for normal transactions', () => {
    expect(isTurnoverDescription('Payment to Amazon')).toBe(false);
    expect(isTurnoverDescription('Salary from employer')).toBe(false);
  });
});

describe('DEFAULT_TURNOVER_KEYWORDS', () => {
  it('contains common English keywords', () => {
    expect(DEFAULT_TURNOVER_KEYWORDS).toContain('opening balance');
    expect(DEFAULT_TURNOVER_KEYWORDS).toContain('closing balance');
    expect(DEFAULT_TURNOVER_KEYWORDS).toContain('total');
  });

  it('contains German keywords', () => {
    expect(DEFAULT_TURNOVER_KEYWORDS).toContain('anfangssaldo');
    expect(DEFAULT_TURNOVER_KEYWORDS).toContain('endsaldo');
  });

  it('contains Estonian keywords', () => {
    expect(DEFAULT_TURNOVER_KEYWORDS).toContain('algsaldo');
    expect(DEFAULT_TURNOVER_KEYWORDS).toContain('lõppsaldo');
  });
});

describe('getDefaultExclusionConfig', () => {
  it('returns a valid config object', () => {
    const config = getDefaultExclusionConfig();

    expect(config.turnoverKeywords).toBeDefined();
    expect(config.descriptionPatterns).toBeDefined();
    expect(config.excludeZeroAmount).toBe(true);
    expect(config.excludeMissingAmount).toBe(true);
  });
});
