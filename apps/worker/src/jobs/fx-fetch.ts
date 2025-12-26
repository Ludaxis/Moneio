import type { Job } from 'bullmq';
import { fetchFxRates } from '../services/fx.js';

export interface FxFetchJob {
  baseCurrency: string;
}

export interface FxFetchResult {
  baseCurrency: string;
  ratesCount: number;
  fetchedAt: string;
}

export async function processFxFetch(job: Job<FxFetchJob>): Promise<FxFetchResult> {
  const { baseCurrency } = job.data;

  console.log(`[FX_FETCH] Fetching rates for ${baseCurrency}`);

  await job.updateProgress(10);

  const rates = await fetchFxRates(baseCurrency);

  await job.updateProgress(50);

  // TODO: Store rates in database
  // await storeFxRates(rates);

  await job.updateProgress(100);

  console.log(`[FX_FETCH] Fetched ${rates.length} rates for ${baseCurrency}`);

  return {
    baseCurrency,
    ratesCount: rates.length,
    fetchedAt: new Date().toISOString(),
  };
}
