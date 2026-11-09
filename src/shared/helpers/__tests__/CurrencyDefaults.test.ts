import { CurrencyDefaults } from "../CurrencyDefaults.js";

describe("CurrencyDefaults.currencyForCountry", () => {
  it("maps ISO-2 codes", () => {
    expect(CurrencyDefaults.currencyForCountry("US")).toBe("usd");
    expect(CurrencyDefaults.currencyForCountry("GH")).toBe("ghs");
    expect(CurrencyDefaults.currencyForCountry("de")).toBe("eur");
  });

  it("maps ISO-3 codes", () => {
    expect(CurrencyDefaults.currencyForCountry("KEN")).toBe("kes");
    expect(CurrencyDefaults.currencyForCountry("GBR")).toBe("gbp");
  });

  it("maps common English names", () => {
    expect(CurrencyDefaults.currencyForCountry("Kenya")).toBe("kes");
    expect(CurrencyDefaults.currencyForCountry("United Kingdom")).toBe("gbp");
    expect(CurrencyDefaults.currencyForCountry("United States of America")).toBe("usd");
    expect(CurrencyDefaults.currencyForCountry("Ireland")).toBe("eur");
  });

  it("ignores case, whitespace and periods", () => {
    expect(CurrencyDefaults.currencyForCountry("  u.s.a. ")).toBe("usd");
    expect(CurrencyDefaults.currencyForCountry("NEW   ZEALAND")).toBe("nzd");
    expect(CurrencyDefaults.currencyForCountry("U.K.")).toBe("gbp");
  });

  it("returns undefined for unknown or empty countries", () => {
    expect(CurrencyDefaults.currencyForCountry("Narnia")).toBeUndefined();
    expect(CurrencyDefaults.currencyForCountry("")).toBeUndefined();
    expect(CurrencyDefaults.currencyForCountry(undefined)).toBeUndefined();
  });

  it("exports the table with lowercase ISO-4217 values", () => {
    expect(CurrencyDefaults.countryCurrencies["australia"]).toBe("aud");
    Object.values(CurrencyDefaults.countryCurrencies).forEach((c) => expect(c).toMatch(/^[a-z]{3}$/));
  });
});
