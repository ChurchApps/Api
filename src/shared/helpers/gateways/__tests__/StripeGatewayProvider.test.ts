// Stub the Environment helper because it uses ESM-only `import.meta.url`,
// which can't be loaded under ts-jest's commonjs transform.
jest.mock("../../Environment", () => ({
  Environment: { membershipApi: "http://test" }
}));

import { StripeGatewayProvider } from "../StripeGatewayProvider";

describe("StripeGatewayProvider.calculateFees", () => {
  const provider = new StripeGatewayProvider();

  // When churchId is empty, the helper skips the membership-api lookup
  // and uses the built-in Stripe rate table.
  describe("card fees by currency (no church overrides)", () => {
    // Stripe rates: 2.9% + fixed
    // Formula: round(((amount + fixed) / (1 - 0.029) - amount) * 100) / 100
    it.each([
      ["USD", 100, 3.30],   // (100.30 / 0.971) - 100 = 3.2956 -> 3.30
      ["GBP", 100, 3.19],   // (100.20 / 0.971) - 100 = 3.1926 -> 3.19
      ["EUR", 100, 3.24],   // (100.25 / 0.971) - 100 = 3.2441 -> 3.24
      ["JPY", 10000, 329.56],  // (10030 / 0.971) - 10000 = 329.557 -> 329.56
      ["INR", 100, 6.08]    // (103 / 0.971) - 100 = 6.0762 -> 6.08
    ])("%s on amount %p returns %p", async (currency, amount, expected) => {
      const fee = await provider.calculateFees(amount, "", currency);
      expect(fee).toBeCloseTo(expected, 2);
    });

    it("treats currency case-insensitively", async () => {
      const upper = await provider.calculateFees(100, "", "GBP");
      const lower = await provider.calculateFees(100, "", "gbp");
      expect(upper).toEqual(lower);
    });

    it("falls back to USD for unknown currencies", async () => {
      const usd = await provider.calculateFees(100, "", "USD");
      const xyz = await provider.calculateFees(100, "", "XYZ");
      expect(xyz).toEqual(usd);
    });

    it("defaults to USD when currency is omitted", async () => {
      const explicit = await provider.calculateFees(100, "", "USD");
      const defaulted = await provider.calculateFees(100, "");
      expect(defaulted).toEqual(explicit);
    });
  });

  describe("ACH/bank fees", () => {
    it("uses 0.8% capped at $5 regardless of currency (USD)", async () => {
      const fee = await provider.calculateFees(100, "", "USD", "bank");
      // 100 / 0.992 - 100 = 0.806... rounded to 0.81
      expect(fee).toBeCloseTo(0.81, 2);
    });

    it("caps the bank fee at $5 for large amounts", async () => {
      const fee = await provider.calculateFees(100000, "", "USD", "bank");
      expect(fee).toEqual(5);
    });
  });
});
