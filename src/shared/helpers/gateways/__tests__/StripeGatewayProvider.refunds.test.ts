// Override the global stripe automock so the refund calls can be inspected.
jest.mock("stripe", () => ({ __esModule: true, default: jest.fn() }));
// Stub Environment (ESM-only import.meta.url) for ts-jest's commonjs transform.
jest.mock("../../Environment", () => ({ Environment: { membershipApi: "http://test" } }));

import Stripe from "stripe";
import { StripeGatewayProvider } from "../StripeGatewayProvider";
import { GatewayConfig } from "../IGatewayProvider";

const config = { privateKey: "sk_test" } as GatewayConfig;

describe("StripeGatewayProvider refunds", () => {
  const provider = new StripeGatewayProvider();

  it("advertises refund support", () => {
    expect(provider.capabilities.supportsRefunds).toBe(true);
    expect(provider.capabilities.supportsPartialRefunds).toBe(false);
  });

  describe("classifyWebhookEvent", () => {
    it("classifies charge.refunded as a refunded donation", () => {
      expect(provider.classifyWebhookEvent("charge.refunded")).toEqual({ action: "donation", status: "refunded" });
    });

    it("still classifies charge.succeeded as complete", () => {
      expect(provider.classifyWebhookEvent("charge.succeeded")).toEqual({ action: "donation", status: "complete" });
    });
  });

  describe("refundCharge", () => {
    let mockStripe: { refunds: { create: jest.Mock } };

    beforeEach(() => {
      mockStripe = { refunds: { create: jest.fn().mockResolvedValue({ id: "re_1", status: "succeeded" }) } };
      (Stripe as unknown as jest.Mock).mockImplementation(() => mockStripe);
    });

    afterEach(() => jest.clearAllMocks());

    it("refunds a payment intent id by payment_intent", async () => {
      const result = await provider.refundCharge(config, "pi_1");
      expect(mockStripe.refunds.create).toHaveBeenCalledWith({ payment_intent: "pi_1" });
      expect(result).toEqual({ success: true, refundId: "re_1" });
    });

    it("refunds a charge id by charge", async () => {
      const result = await provider.refundCharge(config, "ch_1");
      expect(mockStripe.refunds.create).toHaveBeenCalledWith({ charge: "ch_1" });
      expect(result.success).toBe(true);
    });

    it("refuses ids that are not charges", async () => {
      const result = await provider.refundCharge(config, "in_1");
      expect(result.success).toBe(false);
      expect(mockStripe.refunds.create).not.toHaveBeenCalled();
    });

    it("reports a failed refund instead of claiming success", async () => {
      mockStripe.refunds.create.mockResolvedValue({ id: "re_1", status: "failed" });
      const result = await provider.refundCharge(config, "pi_1");
      expect(result).toEqual({ success: false, error: "Refund failed" });
    });

    it("reports the gateway error instead of throwing", async () => {
      mockStripe.refunds.create.mockRejectedValue(new Error("Charge has already been refunded."));
      const result = await provider.refundCharge(config, "pi_1");
      expect(result).toEqual({ success: false, error: "Charge has already been refunded." });
    });
  });
});
