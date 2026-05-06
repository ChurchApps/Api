// Override the global automock from test-setup.ts so we can
// inspect the exact arguments StripeHelper passes to Stripe.
jest.mock("stripe", () => {
  return {
    __esModule: true,
    default: jest.fn()
  };
});

import Stripe from "stripe";
import { StripeHelper } from "../StripeHelper";

type MockStripe = {
  subscriptions: { create: jest.Mock };
  paymentIntents: { create: jest.Mock };
  charges: { create: jest.Mock };
};

const buildMockStripe = (): MockStripe => ({
  subscriptions: { create: jest.fn().mockResolvedValue({ id: "sub_test" }) },
  paymentIntents: { create: jest.fn().mockResolvedValue({ id: "pi_test", status: "succeeded" }) },
  charges: { create: jest.fn().mockResolvedValue({ id: "ch_test" }) }
});

describe("StripeHelper currency handling", () => {
  let mockStripe: MockStripe;

  beforeEach(() => {
    mockStripe = buildMockStripe();
    (Stripe as unknown as jest.Mock).mockImplementation(() => mockStripe);
  });

  describe("createSubscription", () => {
    const baseDonation = {
      customer: "cus_test",
      metadata: { funds: "[]" },
      productId: "prod_test",
      interval: { interval: "month", interval_count: 1 },
      amount: 100,
      payment_method_id: "pm_test",
      type: "card"
    };

    it("uses USD by default and converts amount to cents", async () => {
      await StripeHelper.createSubscription("sk_test", baseDonation);

      const args = mockStripe.subscriptions.create.mock.calls[0][0];
      expect(args.items[0].price_data.currency).toBe("usd");
      expect(args.items[0].price_data.unit_amount).toBe(10000);
    });

    it("passes through GBP currency lowercased and converts amount to pence", async () => {
      await StripeHelper.createSubscription("sk_test", { ...baseDonation, currency: "GBP" });

      const args = mockStripe.subscriptions.create.mock.calls[0][0];
      expect(args.items[0].price_data.currency).toBe("gbp");
      expect(args.items[0].price_data.unit_amount).toBe(10000);
    });

    it("does not multiply by 100 for zero-decimal currencies (JPY)", async () => {
      await StripeHelper.createSubscription("sk_test", { ...baseDonation, amount: 1500, currency: "JPY" });

      const args = mockStripe.subscriptions.create.mock.calls[0][0];
      expect(args.items[0].price_data.currency).toBe("jpy");
      expect(args.items[0].price_data.unit_amount).toBe(1500);
    });

    it("attaches the supplied product id and customer", async () => {
      await StripeHelper.createSubscription("sk_test", { ...baseDonation, currency: "GBP" });

      const args = mockStripe.subscriptions.create.mock.calls[0][0];
      expect(args.customer).toBe("cus_test");
      expect(args.items[0].price_data.product).toBe("prod_test");
      expect(args.default_payment_method).toBe("pm_test");
    });
  });

  describe("donate (one-time charge)", () => {
    const basePayment: any = {
      amount: 25,
      currency: "usd",
      customer: "cus_test",
      payment_method: "pm_test"
    };

    it("converts USD amounts to cents", async () => {
      await StripeHelper.donate("sk_test", { ...basePayment });
      const args = mockStripe.paymentIntents.create.mock.calls[0][0];
      expect(args.currency).toBe("usd");
      expect(args.amount).toBe(2500);
    });

    it("converts GBP amounts to pence", async () => {
      await StripeHelper.donate("sk_test", { ...basePayment, currency: "gbp" });
      const args = mockStripe.paymentIntents.create.mock.calls[0][0];
      expect(args.currency).toBe("gbp");
      expect(args.amount).toBe(2500);
    });

    it("leaves JPY amounts as whole units", async () => {
      await StripeHelper.donate("sk_test", { ...basePayment, amount: 2500, currency: "jpy" });
      const args = mockStripe.paymentIntents.create.mock.calls[0][0];
      expect(args.currency).toBe("jpy");
      expect(args.amount).toBe(2500);
    });
  });

  describe("logDonation", () => {
    const buildRepos = () => {
      const savedDonations: any[] = [];
      return {
        savedDonations,
        repos: {
          customer: { load: jest.fn().mockResolvedValue({ personId: "PER1" }) },
          donationBatch: { getOrCreateCurrent: jest.fn().mockResolvedValue({ id: "BAT1" }) },
          fund: { getOrCreateGeneral: jest.fn().mockResolvedValue({ id: "FUN1" }) },
          donation: {
            save: jest.fn().mockImplementation((d: any) => {
              const saved = { ...d, id: "DON1" };
              savedDonations.push(saved);
              return Promise.resolve(saved);
            })
          },
          fundDonation: { save: jest.fn().mockResolvedValue({}) }
        }
      };
    };

    const stripeChargeEvent = (currency: string, amountCents: number) => ({
      id: "ch_test",
      amount: amountCents,
      currency,
      customer: "cus_test",
      created: 1700000000,
      metadata: { funds: JSON.stringify([{ id: "FUN1", amount: amountCents / 100 }]) },
      payment_method_details: { type: "card", card: { last4: "4242" } }
    });

    it("saves the currency from a USD charge event and converts cents back to dollars", async () => {
      const { savedDonations, repos } = buildRepos();
      await StripeHelper.logDonation("sk_test", "CHU1", stripeChargeEvent("usd", 2500), repos);

      expect(savedDonations).toHaveLength(1);
      expect(savedDonations[0].currency).toBe("usd");
      expect(savedDonations[0].amount).toBe(25);
    });

    it("saves the currency from a GBP charge event", async () => {
      const { savedDonations, repos } = buildRepos();
      await StripeHelper.logDonation("sk_test", "CHU1", stripeChargeEvent("gbp", 5000), repos);

      expect(savedDonations[0].currency).toBe("gbp");
      expect(savedDonations[0].amount).toBe(50);
    });

    it("does not divide by 100 for zero-decimal currencies (JPY)", async () => {
      const { savedDonations, repos } = buildRepos();
      await StripeHelper.logDonation("sk_test", "CHU1", stripeChargeEvent("jpy", 2500), repos);

      expect(savedDonations[0].currency).toBe("jpy");
      expect(savedDonations[0].amount).toBe(2500);
    });
  });
});
