jest.mock("../../Environment", () => ({ Environment: { membershipApi: "http://test" } }));
jest.mock("axios", () => ({ __esModule: true, default: { request: jest.fn(), get: jest.fn() } }));

import crypto from "crypto";
import Axios from "axios";
import { PaystackGatewayProvider } from "../PaystackGatewayProvider";
import { GatewayConfig } from "../IGatewayProvider";

const mockedRequest = (Axios as any).request as jest.Mock;
const mockedGet = (Axios as any).get as jest.Mock;
const ok = (data: any) => ({ data: { status: true, data } });

describe("PaystackGatewayProvider", () => {
  const provider = new PaystackGatewayProvider();
  const config = { churchId: "CHU1", gatewayId: "GAT1", privateKey: "sk_test_secret", publicKey: "pk_test", webhookKey: "", settings: {} } as GatewayConfig;

  beforeEach(() => {
    mockedRequest.mockReset();
    mockedGet.mockReset();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  describe("verifyWebhookSignature", () => {
    const body = { event: "charge.success", data: { id: 123, reference: "ref_1", amount: 5000 } };
    const sign = (raw: string, key = "sk_test_secret") => crypto.createHmac("sha512", key).update(raw).digest("hex");

    it("accepts a body signed with the secret key and keys the event on the reference", async () => {
      const raw = JSON.stringify(body);
      const result = await provider.verifyWebhookSignature(config, { "x-paystack-signature": sign(raw) } as any, body);
      expect(result.success).toBe(true);
      expect(result.eventType).toBe("charge.success");
      expect(result.eventData.id).toBe("ref_1");
      expect(result.eventId).toBe("charge.success:123");
    });

    it("rejects a wrong signature and a missing one", async () => {
      const raw = JSON.stringify(body);
      expect((await provider.verifyWebhookSignature(config, { "x-paystack-signature": sign(raw, "other") } as any, body)).success).toBe(false);
      expect((await provider.verifyWebhookSignature(config, {} as any, body)).success).toBe(false);
    });

    it("keys subscription events on subscription_code", async () => {
      const sub = { event: "subscription.disable", data: { id: 9, subscription_code: "SUB_1" } };
      const result = await provider.verifyWebhookSignature(config, { "x-paystack-signature": sign(JSON.stringify(sub)) } as any, sub);
      expect(result.eventData.id).toBe("SUB_1");
      expect(provider.classifyWebhookEvent(result.eventType!).action).toBe("cancel-subscription");
    });
  });

  describe("processCharge", () => {
    it("verifies the popup reference and reports success", async () => {
      mockedRequest.mockResolvedValue(ok({ status: "success", reference: "ref_1", amount: 1000, authorization: { channel: "card" } }));
      const result = await provider.processCharge(config, { id: "ref_1", amount: 10, saveCard: true });
      expect(result.success).toBe(true);
      expect(result.transactionId).toBe("ref_1");
      expect(result.data.saveCard).toBe(true);
      const call = mockedRequest.mock.calls[0][0];
      expect(call.url).toBe("https://api.paystack.co/transaction/verify/ref_1");
      expect(call.headers.Authorization).toBe("Bearer sk_test_secret");
    });

    it("fails when the transaction did not succeed", async () => {
      mockedRequest.mockResolvedValue(ok({ status: "abandoned", gateway_response: "Abandoned" }));
      const result = await provider.processCharge(config, { id: "ref_2", amount: 10 });
      expect(result.success).toBe(false);
      expect(result.data.error).toBe("Abandoned");
    });

    it("charges a saved authorization in subunits", async () => {
      mockedRequest.mockResolvedValue(ok({ status: "success", reference: "ref_3" }));
      const data: any = { id: "AUTH_abc", amount: 12.5, currency: "ghs", person: { email: "a@b.com" } };
      await provider.prepareCharge(config, data, {});
      expect(data.paymentMethodId).toBe("AUTH_abc");
      await provider.processCharge(config, data);
      const call = mockedRequest.mock.calls[0][0];
      expect(call.url).toContain("/transaction/charge_authorization");
      expect(call.data.amount).toBe(1250);
      expect(call.data.currency).toBe("GHS");
      expect(call.data.authorization_code).toBe("AUTH_abc");
    });
  });

  describe("createSubscription", () => {
    it("verifies the first gift, creates a plan and schedules the next charge", async () => {
      mockedRequest
        .mockResolvedValueOnce(ok({ status: "success", reference: "ref_1", authorization: { authorization_code: "AUTH_1", reusable: true }, customer: { customer_code: "CUS_1" } }))
        .mockResolvedValueOnce(ok({ plan_code: "PLN_1" }))
        .mockResolvedValueOnce(ok({ subscription_code: "SUB_1", status: "active" }));
      const result = await provider.createSubscription(config, { id: "ref_1", amount: 20, currency: "ngn", interval: { interval: "month", interval_count: 1 }, billing_cycle_anchor: Date.now() });
      expect(result.success).toBe(true);
      expect(result.subscriptionId).toBe("SUB_1");
      expect(result.data.customerId).toBe("CUS_1");
      const plan = mockedRequest.mock.calls[1][0].data;
      expect(plan).toMatchObject({ amount: 2000, interval: "monthly", currency: "NGN" });
      const sub = mockedRequest.mock.calls[2][0].data;
      expect(sub).toMatchObject({ customer: "CUS_1", plan: "PLN_1", authorization: "AUTH_1" });
      expect(new Date(sub.start_date).getTime()).toBeGreaterThan(Date.now() + 20 * 86400000);
    });

    it("charges a saved authorization for the first gift before scheduling", async () => {
      mockedRequest
        .mockResolvedValueOnce(ok({ status: "success", reference: "charge_1", authorization: { authorization_code: "AUTH_1" } }))
        .mockResolvedValueOnce(ok({ plan_code: "PLN_1" }))
        .mockResolvedValueOnce(ok({ subscription_code: "SUB_1" }));
      const result = await provider.createSubscription(config, { paymentMethodId: "AUTH_1", customerId: "CUS_1", email: "a@b.com", amount: 5, currency: "ghs", interval: { interval: "week", interval_count: 1 } });
      expect(result.success).toBe(true);
      expect(mockedRequest.mock.calls[0][0].url).toContain("/transaction/charge_authorization");
      expect(mockedRequest.mock.calls[0][0].data).toMatchObject({ authorization_code: "AUTH_1", amount: 500, currency: "GHS" });
      expect(result.data.initialTx.reference).toBe("charge_1");
    });

    it("refuses non-reusable (mobile money) authorizations", async () => {
      mockedRequest.mockResolvedValueOnce(ok({ status: "success", reference: "ref_1", authorization: { authorization_code: "AUTH_1", reusable: false, channel: "mobile_money" }, customer: { customer_code: "CUS_1" } }));
      const result = await provider.createSubscription(config, { id: "ref_1", amount: 20, interval: { interval: "month", interval_count: 1 } });
      expect(result.success).toBe(false);
      expect(result.data.error).toMatch(/cannot be reused/);
      expect(mockedRequest).toHaveBeenCalledTimes(1);
    });

    it("rejects intervals Paystack has no plan for", async () => {
      mockedRequest.mockResolvedValueOnce(ok({ status: "success", reference: "ref_1", authorization: { authorization_code: "AUTH_1", reusable: true }, customer: { customer_code: "CUS_1" } }));
      const result = await provider.createSubscription(config, { id: "ref_1", amount: 20, interval: { interval: "week", interval_count: 2 } });
      expect(result.success).toBe(false);
      expect(result.data.error).toMatch(/2 week/);
    });
  });

  describe("logDonation", () => {
    const repos = () => ({
      donationBatch: { getOrCreateCurrent: jest.fn().mockResolvedValue({ id: "BAT1" }) },
      donation: { save: jest.fn().mockImplementation(async (d: any) => ({ ...d, id: "DON1" })) },
      fundDonation: { save: jest.fn() },
      customer: { load: jest.fn().mockResolvedValue({ personId: "PER_CUS" }), save: jest.fn() },
      gatewayPaymentMethod: { loadByExternalId: jest.fn().mockResolvedValue(null), save: jest.fn() },
      subscription: { loadByCustomerId: jest.fn().mockResolvedValue([]) },
      subscriptionFunds: { loadBySubscriptionId: jest.fn() },
      fund: { getOrCreateGeneral: jest.fn().mockResolvedValue({ id: "FUN_GEN" }) }
    });

    it("allocates a fund-less renewal to the subscription's funds, else the General Fund", async () => {
      const r = repos();
      r.subscription.loadByCustomerId.mockResolvedValue([{ id: "SUB_1" }]);
      r.subscriptionFunds.loadBySubscriptionId.mockResolvedValue([{ fundId: "FUN_SUB", amount: 15 }]);
      await provider.logDonation(config, "CHU1", { reference: "r1", amount: 1500, customer: { customer_code: "CUS_1" }, authorization: { channel: "card" } }, r);
      expect(r.fundDonation.save).toHaveBeenCalledWith(expect.objectContaining({ fundId: "FUN_SUB", amount: 15 }));

      const r2 = repos();
      await provider.logDonation(config, "CHU1", { reference: "r2", amount: 1500, customer: { customer_code: "CUS_1" }, authorization: { channel: "card" } }, r2);
      expect(r2.fundDonation.save).toHaveBeenCalledWith(expect.objectContaining({ fundId: "FUN_GEN", amount: 15 }));
    });

    it("logs a charge-path gift in major units with its funds and saves a reusable card", async () => {
      const r = repos();
      await provider.logDonation(config, "CHU1", {
        reference: "ref_1",
        amount: 25,
        person: { id: "PER1" },
        funds: [{ id: "FUN1", amount: 25 }],
        saveCard: true,
        customer: { customer_code: "CUS_1" },
        authorization: { authorization_code: "AUTH_1", reusable: true, channel: "card", brand: "visa", last4: "4081" }
      }, r);
      expect(r.donation.save.mock.calls[0][0]).toMatchObject({ amount: 25, personId: "PER1", transactionId: "ref_1", method: "Card", methodDetails: "VISA ****4081" });
      expect(r.fundDonation.save).toHaveBeenCalledWith(expect.objectContaining({ fundId: "FUN1", amount: 25, donationId: "DON1" }));
      expect(r.gatewayPaymentMethod.save).toHaveBeenCalledWith(expect.objectContaining({ externalId: "AUTH_1", customerId: "CUS_1" }));
    });

    it("logs a webhook gift from subunits, resolves the person via the customer and labels mobile money", async () => {
      const r = repos();
      await provider.logDonation(config, "CHU1", {
        reference: "ref_2",
        amount: 150000,
        customer: { customer_code: "CUS_1" },
        channel: "mobile_money",
        authorization: { channel: "mobile_money", bank: "MTN", last4: "1234", reusable: false, authorization_code: "AUTH_2" },
        saveCard: true,
        metadata: { funds: [{ id: "FUN2", amount: 1500 }] }
      }, r);
      expect(r.donation.save.mock.calls[0][0]).toMatchObject({ amount: 1500, personId: "PER_CUS", method: "Mobile Money", methodDetails: "MTN ****1234" });
      expect(r.gatewayPaymentMethod.save).not.toHaveBeenCalled();
    });
  });

  describe("calculateFees", () => {
    it("uses per-currency defaults with the NGN cap and waiver", async () => {
      expect(await provider.calculateFees(100, "", "GHS")).toBeCloseTo(1.99, 2);
      expect(await provider.calculateFees(1000, "", "NGN")).toBe(0 + Math.round(((1000) / 0.985 - 1000) * 100) / 100);
      expect(await provider.calculateFees(1000000, "", "NGN")).toBe(2000);
    });

    it("prefers the church's card overrides", async () => {
      mockedGet.mockResolvedValue({ data: { transFeeCC: "2", flatRateCC: "0.5" } });
      expect(await provider.calculateFees(100, "CHU1", "GHS")).toBeCloseTo(2.55, 2);
    });
  });
});
