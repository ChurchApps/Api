/** Tests the server-owned exchange-rate cache and the group-by-currency conversion behind the giving dashboards. */

// Jest cannot load the ESM-only @churchapps/helpers build, so mirror the one pure function used here.
jest.mock("@churchapps/helpers", () => ({
  CurrencyHelper: {
    convertAmount: (amount: number, from: string, to: string, rates: Record<string, number>) => {
      if ((from || "USD").toUpperCase() === (to || "USD").toUpperCase()) return amount;
      const rate = rates?.[(from || "USD").toUpperCase()];
      return rate ? Number((amount / rate).toFixed(2)) : amount;
    }
  }
}), { virtual: true });

const axiosGetMock = jest.fn();
jest.mock("axios", () => ({ __esModule: true, default: { get: (...args: any[]) => axiosGetMock(...args) } }));

import { ExchangeRateHelper } from "../ExchangeRateHelper.js";

const usdRates = { EUR: 0.8, GBP: 0.5 };

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  ExchangeRateHelper.clearCache();
  axiosGetMock.mockResolvedValue({ data: { base: "USD", date: "2026-09-18", rates: usdRates } });
});

describe("ExchangeRateHelper.getRateTable", () => {
  it("fetches frankfurter for the church currency and caches it per base", async () => {
    const first = await ExchangeRateHelper.getRateTable("usd");
    const second = await ExchangeRateHelper.getRateTable("USD");

    expect(axiosGetMock).toHaveBeenCalledTimes(1);
    expect(axiosGetMock.mock.calls[0][0]).toBe("https://api.frankfurter.dev/v1/latest?base=USD");
    expect(first).toEqual({ base: "usd", rates: usdRates, asOf: "2026-09-18" });
    expect(second.rates).toEqual(usdRates);

    await ExchangeRateHelper.getRateTable("eur");
    expect(axiosGetMock).toHaveBeenCalledTimes(2);
  });

  it("refetches once the cached rates are older than 12 hours", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-09-20T00:00:00Z"));
    await ExchangeRateHelper.getRates("usd");
    jest.setSystemTime(new Date("2026-09-20T11:59:00Z"));
    await ExchangeRateHelper.getRates("usd");
    expect(axiosGetMock).toHaveBeenCalledTimes(1);

    jest.setSystemTime(new Date("2026-09-20T12:01:00Z"));
    await ExchangeRateHelper.getRates("usd");
    expect(axiosGetMock).toHaveBeenCalledTimes(2);
  });

  it("returns no rates instead of throwing when frankfurter is unreachable, and does not cache the failure", async () => {
    axiosGetMock.mockRejectedValueOnce(new Error("ENOTFOUND"));
    expect(await ExchangeRateHelper.getRates("usd")).toEqual({});

    expect(await ExchangeRateHelper.getRates("usd")).toEqual(usdRates);
    expect(axiosGetMock).toHaveBeenCalledTimes(2);
  });

  it("ignores a base that is not a 3-letter currency code", async () => {
    expect(await ExchangeRateHelper.getRates("usd&symbols=x")).toEqual({});
    expect(axiosGetMock).not.toHaveBeenCalled();
  });
});

describe("ExchangeRateHelper.convertTotals", () => {
  it("converts each currency group into the church currency and flags the result", () => {
    const result = ExchangeRateHelper.convertTotals([{ currency: "usd", amount: 100 }, { currency: "EUR", amount: 80 }], "usd", usdRates);
    expect(result).toEqual({
      totalAmount: 200,
      currency: "usd",
      isConverted: true,
      amountsByCurrency: [{ currency: "usd", amount: 100 }, { currency: "eur", amount: 80 }]
    });
  });

  it("treats gifts without a currency as the church currency", () => {
    const result = ExchangeRateHelper.convertTotals([{ currency: null as any, amount: 50 }, { currency: "", amount: 25 }], "gbp", { USD: 2 });
    expect(result.totalAmount).toBe(75);
    expect(result.isConverted).toBe(false);
    expect(result.amountsByCurrency).toEqual([{ currency: "gbp", amount: 75 }]);
  });

  it("leaves a currency frankfurter has no rate for unconverted", () => {
    const result = ExchangeRateHelper.convertTotals([{ currency: "ghs", amount: 40 }], "usd", usdRates);
    expect(result.totalAmount).toBe(40);
    expect(result.isConverted).toBe(false);
  });

  it("is not flagged when every gift is already in the church currency", () => {
    const result = ExchangeRateHelper.convertTotals([{ currency: "USD", amount: 10 }, { currency: "usd", amount: 5 }], "usd", usdRates);
    expect(result).toEqual({ totalAmount: 15, currency: "usd", isConverted: false, amountsByCurrency: [{ currency: "usd", amount: 15 }] });
  });
});
