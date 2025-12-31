import { describe, it, expect } from 'vitest';

import { createAmountParser, detectAmountConfig, type AmountParserConfig } from './amount-parser';

describe('AmountParser', () => {
  describe('single column parsing', () => {
    const config: AmountParserConfig = {
      type: 'single',
      amountColumn: 'Amount',
      signConvention: 'negative-debit',
    };

    const parser = createAmountParser(config);

    it('parses positive amounts', () => {
      const result = parser.parse({ Amount: '100.50' });

      expect(result.amount).toBe(100.5);
      expect(result.source).toBe('single');
    });

    it('parses negative amounts', () => {
      const result = parser.parse({ Amount: '-250.00' });

      expect(result.amount).toBe(-250);
    });

    it('parses European format (comma as decimal)', () => {
      const result = parser.parse({ Amount: '1.234,56' });

      expect(result.amount).toBe(1234.56);
    });

    it('parses amounts with currency symbols', () => {
      const result = parser.parse({ Amount: '€100.50' });

      expect(result.amount).toBe(100.5);
    });

    it('parses amounts with parentheses as negative', () => {
      const result = parser.parse({ Amount: '(500.00)' });

      expect(result.amount).toBe(-500);
    });

    it('returns null for empty values', () => {
      const result = parser.parse({ Amount: '' });

      expect(result.amount).toBeNull();
      expect(result.warnings).toContain('Empty amount value');
    });

    it('returns null for non-numeric values', () => {
      const result = parser.parse({ Amount: 'abc' });

      expect(result.amount).toBeNull();
    });

    it('handles spaces as thousands separator', () => {
      const result = parser.parse({ Amount: '1 234.56' });

      expect(result.amount).toBe(1234.56);
    });

    it('handles apostrophe as thousands separator', () => {
      const result = parser.parse({ Amount: "1'234.56" });

      expect(result.amount).toBe(1234.56);
    });
  });

  describe('split column parsing', () => {
    const config: AmountParserConfig = {
      type: 'split',
      debitColumn: 'Debit',
      creditColumn: 'Credit',
      signConvention: 'absolute',
    };

    const parser = createAmountParser(config);

    it('parses debit column as negative', () => {
      const result = parser.parse({ Debit: '100.00', Credit: '' });

      expect(result.amount).toBe(-100);
      expect(result.source).toBe('debit');
    });

    it('parses credit column as positive', () => {
      const result = parser.parse({ Debit: '', Credit: '250.00' });

      expect(result.amount).toBe(250);
      expect(result.source).toBe('credit');
    });

    it('handles both columns with values (uses larger)', () => {
      const result = parser.parse({ Debit: '50.00', Credit: '100.00' });

      expect(result.amount).toBe(100);
      expect(result.source).toBe('credit');
      expect(result.warnings).toContain('Both debit and credit columns have values');
    });

    it('returns null when both columns are empty', () => {
      const result = parser.parse({ Debit: '', Credit: '' });

      expect(result.amount).toBeNull();
    });

    it('handles only debit column configured', () => {
      const debitOnlyConfig: AmountParserConfig = {
        type: 'split',
        debitColumn: 'Debit',
        signConvention: 'absolute',
      };
      const debitParser = createAmountParser(debitOnlyConfig);

      const result = debitParser.parse({ Debit: '100.00' });

      expect(result.amount).toBe(-100);
    });
  });

  describe('sign conventions', () => {
    it('handles negative-debit convention', () => {
      const config: AmountParserConfig = {
        type: 'split',
        debitColumn: 'Debit',
        creditColumn: 'Credit',
        signConvention: 'negative-debit',
      };
      const parser = createAmountParser(config);

      const debitResult = parser.parse({ Debit: '100', Credit: '' });
      const creditResult = parser.parse({ Debit: '', Credit: '100' });

      expect(debitResult.amount).toBe(-100);
      expect(creditResult.amount).toBe(100);
    });

    it('handles positive-debit convention', () => {
      const config: AmountParserConfig = {
        type: 'split',
        debitColumn: 'Debit',
        creditColumn: 'Credit',
        signConvention: 'positive-debit',
      };
      const parser = createAmountParser(config);

      const debitResult = parser.parse({ Debit: '100', Credit: '' });
      const creditResult = parser.parse({ Debit: '', Credit: '100' });

      expect(debitResult.amount).toBe(100);
      expect(creditResult.amount).toBe(-100);
    });

    it('handles absolute convention', () => {
      const config: AmountParserConfig = {
        type: 'split',
        debitColumn: 'Debit',
        creditColumn: 'Credit',
        signConvention: 'absolute',
      };
      const parser = createAmountParser(config);

      const debitResult = parser.parse({ Debit: '100', Credit: '' });
      const creditResult = parser.parse({ Debit: '', Credit: '100' });

      expect(debitResult.amount).toBe(-100);
      expect(creditResult.amount).toBe(100);
    });
  });

  describe('rawValues tracking', () => {
    it('tracks single column raw value', () => {
      const config: AmountParserConfig = {
        type: 'single',
        amountColumn: 'Amount',
        signConvention: 'negative-debit',
      };
      const parser = createAmountParser(config);

      const result = parser.parse({ Amount: '€1,234.56' });

      expect(result.rawValues.amount).toBe('€1,234.56');
    });

    it('tracks split column raw values', () => {
      const config: AmountParserConfig = {
        type: 'split',
        debitColumn: 'Debit',
        creditColumn: 'Credit',
        signConvention: 'absolute',
      };
      const parser = createAmountParser(config);

      const result = parser.parse({ Debit: '100.00', Credit: '200.00' });

      expect(result.rawValues.debit).toBe('100.00');
      expect(result.rawValues.credit).toBe('200.00');
    });
  });
});

describe('detectAmountConfig', () => {
  it('detects split columns with debit/credit headers', () => {
    const headers = ['Date', 'Description', 'Debit', 'Credit', 'Balance'];
    const config = detectAmountConfig(headers);

    expect(config.type).toBe('split');
    expect(config.debitColumn).toBe('Debit');
    expect(config.creditColumn).toBe('Credit');
  });

  it('detects split columns with withdrawal/deposit headers', () => {
    const headers = ['Date', 'Description', 'Withdrawal', 'Deposit'];
    const config = detectAmountConfig(headers);

    expect(config.type).toBe('split');
    expect(config.debitColumn).toBe('Withdrawal');
    expect(config.creditColumn).toBe('Deposit');
  });

  it('detects single amount column', () => {
    const headers = ['Date', 'Description', 'Amount', 'Balance'];
    const config = detectAmountConfig(headers);

    expect(config.type).toBe('single');
    expect(config.amountColumn).toBe('Amount');
  });

  it('returns empty config when no amount columns found', () => {
    const headers = ['Date', 'Description', 'Reference'];
    const config = detectAmountConfig(headers);

    expect(config.type).toBeUndefined();
  });

  it('detects German headers', () => {
    const headers = ['Datum', 'Beschreibung', 'Soll', 'Haben'];
    const config = detectAmountConfig(headers);

    expect(config.type).toBe('split');
  });

  it('detects Estonian headers', () => {
    const headers = ['Kuupäev', 'Selgitus', 'Deebet', 'Kreedit'];
    const config = detectAmountConfig(headers);

    expect(config.type).toBe('split');
  });
});
