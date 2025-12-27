import { prisma } from '@moneio/db';
import { Job } from 'bullmq';

import type { FxFetchJobData, FxFetchResult } from '../lib/queues';

/**
 * FX_FETCH handler
 *
 * Fetch foreign exchange rates from external API
 * - Fetch rates for base currency
 * - Store in fx_rates table
 * - Used for multi-currency support
 */
export async function handleFxFetch(job: Job<FxFetchJobData>): Promise<FxFetchResult> {
  const { baseCurrency, workspaceId } = job.data;

  console.log(`[FX_FETCH] Fetching rates for ${baseCurrency}`);

  try {
    await job.updateProgress(10);

    // TODO: Implement actual FX fetch in T20
    // - Call external FX API (exchangerate-api, etc.)
    // - Parse response
    // - Store rates

    const fxApiUrl = process.env.FX_RATES_API_URL;
    if (!fxApiUrl) {
      console.warn('[FX_FETCH] FX_RATES_API_URL not configured, using mock rates');
    }

    await job.updateProgress(50);

    // Mock rates for demo
    const mockRates: Record<string, number> = {
      EUR: baseCurrency === 'EUR' ? 1 : 0.92,
      USD: baseCurrency === 'USD' ? 1 : 1.09,
      GBP: baseCurrency === 'GBP' ? 1 : 0.79,
      CHF: baseCurrency === 'CHF' ? 1 : 0.96,
      JPY: baseCurrency === 'JPY' ? 1 : 163.5,
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let ratesCount = 0;

    for (const [currency, rate] of Object.entries(mockRates)) {
      if (currency === baseCurrency) continue;

      await prisma.fxRate.upsert({
        where: {
          workspaceId_baseCurrency_quoteCurrency_effectiveDate: {
            workspaceId: workspaceId || 'global',
            baseCurrency,
            quoteCurrency: currency,
            effectiveDate: today,
          },
        },
        update: {
          rate,
        },
        create: {
          workspaceId: workspaceId || 'global',
          baseCurrency,
          quoteCurrency: currency,
          rate,
          effectiveDate: today,
        },
      });

      ratesCount++;
    }

    await job.updateProgress(100);

    console.log(`[FX_FETCH] Stored ${ratesCount} rates for ${baseCurrency}`);

    return {
      success: true,
      baseCurrency,
      ratesCount,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[FX_FETCH] Failed for ${baseCurrency}:`, errorMessage);

    return {
      success: false,
      baseCurrency,
      ratesCount: 0,
      error: errorMessage,
    };
  }
}
