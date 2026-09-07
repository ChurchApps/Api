// Override the global stripe automock so the invoice calls can be inspected.
jest.mock("stripe", () => ({ __esModule: true, default: jest.fn() }));
// Stub Environment (ESM-only import.meta.url) for ts-jest's commonjs transform.
jest.mock("../../Environment", () => ({ Environment: { membershipApi: "http://test" } }));

import Stripe from "stripe";
import { StripeGatewayProvider } from "../StripeGatewayProvider";
import { GatewayConfig } from "../IGatewayProvider";

const config = { privateKey: "sk_test" } as GatewayConfig;

describe("StripeGatewayProvider failed recurring payments", () => {
  const provider = new StripeGatewayProvider();

  describe("classifyWebhookEvent", () => {
    it("classifies invoice.payment_failed as a failed donation", () => {
      expect(provider.classifyWebhookEvent("invoice.payment_failed")).toEqual({ action: "donation", status: "failed" });
    });

    it("still classifies invoice.paid as complete so a failed row can be promoted", () => {
      expect(provider.classifyWebhookEvent("invoice.paid")).toEqual({ action: "donation", status: "complete" });
    });
  });

  describe("logDonation on a failed invoice", () => {
    const makeRepos = () => ({
      customer: { load: jest.fn().mockResolvedValue({ personId: "per1" }) },
      donationBatch: { getOrCreateCurrent: jest.fn().mockResolvedValue({ id: "batch1" }) },
      donation: { save: jest.fn().mockImplementation(async (d: any) => ({ ...d, id: "don1" })) },
      fundDonation: { save: jest.fn().mockResolvedValue({}) },
      subscriptionFunds: { loadForSubscriptionLog: jest.fn().mockResolvedValue([{ id: "f1", amount: 25 }]) },
      fund: { getOrCreateGeneral: jest.fn().mockResolvedValue({ id: "general" }) }
    });

    it("records the invoice amount due and the subscription's fund split", async () => {
      const repos = makeRepos();
      const invoice = { id: "in_1", customer: "cus_1", subscription: "sub_1", amount_due: 2500, amount_paid: 0, currency: "usd", created: 1756000000 };

      await provider.logDonation(config, "ch1", invoice, repos, "failed");

      const saved = repos.donation.save.mock.calls[0][0];
      expect(saved.status).toEqual("failed");
      expect(saved.amount).toEqual(25);
      expect(saved.transactionId).toEqual("in_1");
      expect(saved.personId).toEqual("per1");
      expect(repos.subscriptionFunds.loadForSubscriptionLog).toHaveBeenCalledWith("ch1", "sub_1");
      expect(repos.fund.getOrCreateGeneral).not.toHaveBeenCalled();
    });
  });

  describe("retryFailedPayment", () => {
    let mockStripe: { invoices: { pay: jest.Mock } };

    beforeEach(() => {
      mockStripe = { invoices: { pay: jest.fn().mockResolvedValue({ id: "in_1", status: "paid" }) } };
      (Stripe as unknown as jest.Mock).mockImplementation(() => mockStripe);
    });

    afterEach(() => jest.clearAllMocks());

    it("pays the invoice and reports success", async () => {
      const result = await provider.retryFailedPayment(config, { transactionId: "in_1" });
      expect(mockStripe.invoices.pay).toHaveBeenCalledWith("in_1");
      expect(result).toEqual({ success: true });
    });

    it("reports the gateway error instead of throwing", async () => {
      mockStripe.invoices.pay.mockRejectedValue(new Error("Your card was declined."));
      const result = await provider.retryFailedPayment(config, { transactionId: "in_1" });
      expect(result).toEqual({ success: false, error: "Your card was declined." });
    });

    it("refuses ids that are not subscription invoices", async () => {
      const result = await provider.retryFailedPayment(config, { transactionId: "ch_1" });
      expect(result.success).toBe(false);
      expect(mockStripe.invoices.pay).not.toHaveBeenCalled();
    });
  });
});
