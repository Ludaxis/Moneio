import { config } from '../config.js';

interface FxRate {
  base: string;
  quote: string;
  rate: number;
  date: string;
}

export async function fetchFxRates(baseCurrency: string): Promise<FxRate[]> {
  const url = `${config.FX_PROVIDER_BASE_URL}/latest?base=${baseCurrency}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch FX rates: ${response.statusText}`);
  }

  const data = await response.json();

  if (!data.success && data.error) {
    throw new Error(`FX API error: ${data.error.message || 'Unknown error'}`);
  }

  const rates: FxRate[] = [];

  for (const [quote, rate] of Object.entries(data.rates || {})) {
    rates.push({
      base: baseCurrency,
      quote,
      rate: rate as number,
      date: data.date || new Date().toISOString().split('T')[0],
    });
  }

  return rates;
}

export async function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rate?: number
): Promise<number> {
  if (fromCurrency === toCurrency) {
    return amount;
  }

  if (!rate) {
    const rates = await fetchFxRates(fromCurrency);
    const foundRate = rates.find((r) => r.quote === toCurrency);

    if (!foundRate) {
      throw new Error(`No rate found for ${fromCurrency} to ${toCurrency}`);
    }

    rate = foundRate.rate;
  }

  return amount * rate;
}
