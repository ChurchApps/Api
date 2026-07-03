// Multi-currency integration tests (skipped unless STRIPE_INTEGRATION_TESTS=1 and STRIPE_TEST_SECRET_KEY set).
// Run: STRIPE_INTEGRATION_TESTS=1 STRIPE_TEST_SECRET_KEY=sk_test_... npx jest StripeHelper.integration
// On Windows PowerShell: $env:STRIPE_INTEGRATION_TESTS="1"; $env:STRIPE_TEST_SECRET_KEY="sk_test_..."; npx jest StripeHelper.integration
// Note: creates real test-mode resources (sandboxed, no money moves).

// Unmock to hit the real SDK (bypasses test-setup.ts global mock).
jest.unmock("stripe");

const RUN_INTEGRATION = process.env.STRIPE_INTEGRATION_TESTS === "1";
const SECRET_KEY = process.env.STRIPE_TEST_SECRET_KEY || "";

// Use describe.skip if not enabled, so the file imports cleanly and CI doesn't miscount test runs.
const describeIntegration = RUN_INTEGRATION && SECRET_KEY ? describe : describe.skip;

describeIntegration("Stripe integration: USD + GBP", () => {
  // Lazy-import to load real Stripe module only in this scope.
  const { StripeHelper } = require("../StripeHelper");

  let customerId: string;
  let productId: string;

  beforeAll(async () => {
    if (!SECRET_KEY) return;
    customerId = await StripeHelper.createCustomer(
      SECRET_KEY,
      `currency-test-${Date.now()}@example.com`,
      "Currency Test Customer"
    );
    productId = await StripeHelper.createProduct(SECRET_KEY, "TESTCHURCH1");
  }, 30000);

  describe("one-time PaymentIntent (test card pm_card_visa)", () => {
    it.each([
      ["usd", 25.00],
      ["gbp", 25.00]
    ])("creates a %s PaymentIntent that succeeds", async (currency, amount) => {
      // pm_card_visa is a Stripe preset test PaymentMethod that auto-confirms (Visa 4242 success).
      const result = await StripeHelper.donate(SECRET_KEY, {
        amount,
        currency,
        customer: customerId,
        payment_method: "pm_card_visa",
        confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: "never" },
        metadata: { funds: "[]", notes: "integration test" }
      });

      expect(result).toBeDefined();
      expect(result.currency).toBe(currency);
      // Amount stored in smallest units: 25.00 -> 2500 cents.
      expect(result.amount).toBe(2500);
      expect(result.status).toBe("succeeded");
    }, 30000);
  });

  describe("recurring subscription", () => {
    it.each([
      ["usd"],
      ["gbp"]
    ])("creates a %s subscription with the correct currency on the price", async (currency) => {
      // Create a payment method for the test customer (subscriptions need one attached).
      const Stripe = require("stripe");
      const stripe = new Stripe(SECRET_KEY, { apiVersion: "2025-02-24.acacia" });

      const pm = await stripe.paymentMethods.create({
        type: "card",
        card: { token: "tok_visa" }
      });
      await stripe.paymentMethods.attach(pm.id, { customer: customerId });

      const subscription = await StripeHelper.createSubscription(SECRET_KEY, {
        customer: customerId,
        metadata: { funds: "[]" },
        productId,
        interval: { interval: "month", interval_count: 1 },
        amount: 10,
        payment_method_id: pm.id,
        type: "card",
        currency
      });

      expect(subscription.id).toMatch(/^sub_/);
      const price = subscription.items.data[0].price;
      expect(price.currency).toBe(currency);
      expect(price.unit_amount).toBe(1000); // 10.00 -> 1000 minor units
      await stripe.subscriptions.cancel(subscription.id); // Clean up for subsequent runs.
    }, 60000);
  });
});
