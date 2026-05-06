// Real Stripe test-mode integration tests for multi-currency support.
//
// Skipped by default. To run, set STRIPE_INTEGRATION_TESTS=1 and STRIPE_TEST_SECRET_KEY
// in your shell environment:
//
//   STRIPE_INTEGRATION_TESTS=1 STRIPE_TEST_SECRET_KEY=sk_test_... npx jest StripeHelper.integration
//
// On Windows PowerShell:
//
//   $env:STRIPE_INTEGRATION_TESTS="1"; $env:STRIPE_TEST_SECRET_KEY="sk_test_..."; npx jest StripeHelper.integration
//
// These tests create real test-mode customers and PaymentIntents in the Stripe
// account associated with the secret key. Test-mode resources are sandboxed and
// don't move money, but they will appear in the Stripe Dashboard's test view.

// Bypass the global jest.mock("stripe") from test-setup.ts so we hit the real SDK.
jest.unmock("stripe");

const RUN_INTEGRATION = process.env.STRIPE_INTEGRATION_TESTS === "1";
const SECRET_KEY = process.env.STRIPE_TEST_SECRET_KEY || "";

// Use describe.skip when integration tests aren't enabled so the file always
// imports cleanly (and CI doesn't pretend it ran tests it didn't).
const describeIntegration = RUN_INTEGRATION && SECRET_KEY ? describe : describe.skip;

describeIntegration("Stripe integration: USD + GBP", () => {
  // Lazily import StripeHelper so the real Stripe module is loaded only here.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
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
      // Stripe ships preset test PaymentMethod ids that auto-confirm. `pm_card_visa`
      // = Visa 4242 success. See https://stripe.com/docs/testing#cards
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
      // Stripe stores amount in the smallest unit (cents/pence). 25.00 -> 2500.
      expect(result.amount).toBe(2500);
      expect(result.status).toBe("succeeded");
    }, 30000);
  });

  describe("recurring subscription", () => {
    it.each([
      ["usd"],
      ["gbp"]
    ])("creates a %s subscription with the correct currency on the price", async (currency) => {
      // Subscriptions need a payment method attached to the customer first.
      // Reuse pm_card_visa via a fresh PaymentMethod creation for the test customer.
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
      // 10.00 in major units -> 1000 in minor units
      expect(price.unit_amount).toBe(1000);

      // Tidy up so the test account doesn't accumulate active subs across runs.
      await stripe.subscriptions.cancel(subscription.id);
    }, 60000);
  });
});
