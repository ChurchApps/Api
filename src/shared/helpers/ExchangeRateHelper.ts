import axios from "axios";
import { CurrencyHelper } from "@churchapps/helpers";

export interface CurrencyAmount {
  currency: string;
  amount: number;
}

export interface ConvertedTotal {
  totalAmount: number;
  currency: string;
  isConverted: boolean;
  amountsByCurrency: CurrencyAmount[];
}

export interface RateTable {
  base: string;
  rates: Record<string, number>;
  asOf: string;
}

// Server-side twin of CurrencyHelper.getExchangeRates(). The Api owns the rate so a dashboard
// total never depends on a number the browser sent; nothing here accepts a rate map from a request.
export class ExchangeRateHelper {
  static CACHE_EXPIRATION = 12 * 60 * 60 * 1000; // 12 hours
  private static cache = new Map<string, { table: RateTable; fetchedAt: number }>();

  static async getRates(base: string): Promise<Record<string, number>> {
    return (await this.getRateTable(base)).rates;
  }

  static async getRateTable(base: string): Promise<RateTable> {
    const key = (base || "usd").toLowerCase();
    const empty: RateTable = { base: key, rates: {}, asOf: "" };
    if (!/^[a-z]{3}$/.test(key)) return empty;

    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.fetchedAt <= this.CACHE_EXPIRATION) return cached.table;

    try {
      const response = await axios.get(`https://api.frankfurter.dev/v1/latest?base=${key.toUpperCase()}`, { timeout: 5000 });
      const rates = response.data?.rates;
      if (!rates || typeof rates !== "object") return cached?.table ?? empty;
      const table: RateTable = { base: key, rates, asOf: response.data?.date || "" };
      this.cache.set(key, { table, fetchedAt: Date.now() });
      return table;
    } catch {
      // Frankfurter down or a base it doesn't publish: fall back to stale rates, else totals stay unconverted.
      return cached?.table ?? empty;
    }
  }

  // Gifts saved before donations carried a currency belong to the church currency.
  static normalizeCurrency(currency: string | null | undefined, churchCurrency: string) {
    return (currency || churchCurrency || "usd").toLowerCase();
  }

  static convert(amount: number, currency: string | null | undefined, churchCurrency: string, rates: Record<string, number>) {
    return CurrencyHelper.convertAmount(Number(amount || 0), this.normalizeCurrency(currency, churchCurrency), churchCurrency, rates);
  }

  static isConvertible(currency: string | null | undefined, churchCurrency: string, rates: Record<string, number>) {
    const from = this.normalizeCurrency(currency, churchCurrency);
    return from !== churchCurrency.toLowerCase() && !!rates?.[from.toUpperCase()];
  }

  // rows are already grouped by currency in SQL, so this is a handful of entries, never every gift.
  static convertTotals(rows: { currency: string | null; amount: number }[], churchCurrency: string, rates: Record<string, number>): ConvertedTotal {
    const target = (churchCurrency || "usd").toLowerCase();
    const grouped = new Map<string, number>();
    rows.forEach((row) => {
      const currency = this.normalizeCurrency(row.currency, target);
      grouped.set(currency, (grouped.get(currency) || 0) + Number(row.amount || 0));
    });

    let total = 0;
    let isConverted = false;
    const amountsByCurrency: CurrencyAmount[] = [];
    grouped.forEach((amount, currency) => {
      total += this.convert(amount, currency, target, rates);
      if (this.isConvertible(currency, target, rates)) isConverted = true;
      amountsByCurrency.push({ currency, amount: Number(amount.toFixed(2)) });
    });

    return { totalAmount: Number(total.toFixed(2)), currency: target, isConverted, amountsByCurrency };
  }

  static clearCache() {
    this.cache.clear();
  }
}
