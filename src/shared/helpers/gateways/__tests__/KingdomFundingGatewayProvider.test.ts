// Environment + models use ESM-only constructs / DB wiring that don't load under
// ts-jest's commonjs transform, and verifyWebhookSignature needs neither — stub them.
jest.mock("../../Environment", () => ({ Environment: { membershipApi: "http://test" } }));
jest.mock("../../../../modules/giving/models/index", () => ({
  Donation: class {},
  DonationBatch: class {},
  EventLog: class {},
  FundDonation: class {},
}));

import crypto from "crypto";
import { KingdomFundingGatewayProvider } from "../KingdomFundingGatewayProvider";

describe("KingdomFundingGatewayProvider.verifyWebhookSignature (NMI)", () => {
  const provider = new KingdomFundingGatewayProvider();
  const secret = "whsec_test_signing_key";
  const nonce = "1718900000";

  const payloadObj = {
    event_id: "evt_abc123",
    event_type: "transaction.sale.success",
    event_body: { transaction: { transaction_id: "12202439231", amount: "10.00", cc_type: "visa" } },
  };
  const rawPayload = JSON.stringify(payloadObj);

  const sign = (raw: string) =>
    crypto.createHmac("sha256", secret).update(`${nonce}.${raw}`, "utf-8").digest("hex");

  const baseConfig: any = {
    gatewayId: "g1", churchId: "c1", publicKey: "pk", privateKey: "sk", webhookKey: secret,
  };
  const validHeaders = (raw: string) => ({ "webhook-signature": `t=${nonce},s=${sign(raw)}` });

  it("accepts a correctly-signed payload as a raw STRING (production path)", async () => {
    const res = await provider.verifyWebhookSignature(baseConfig, validHeaders(rawPayload) as any, rawPayload);
    expect(res.success).toBe(true);
    expect(res.shouldProcess).toBe(true);
    expect(res.eventId).toBe("evt_abc123");
    expect(res.eventType).toBe("transaction.sale.success");
    expect(res.eventData?.id).toBe("12202439231");
  });

  it("accepts the same payload delivered as a BUFFER (local-dev path)", async () => {
    // This is the case the fix addresses: JSON.stringify(buffer) would never match.
    const res = await provider.verifyWebhookSignature(baseConfig, validHeaders(rawPayload) as any, Buffer.from(rawPayload, "utf8"));
    expect(res.success).toBe(true);
    expect(res.shouldProcess).toBe(true);
    expect(res.eventData?.id).toBe("12202439231");
  });

  it("rejects a tampered signature", async () => {
    const headers = { "webhook-signature": `t=${nonce},s=${"0".repeat(64)}` };
    const res = await provider.verifyWebhookSignature(baseConfig, headers as any, rawPayload);
    expect(res.success).toBe(false);
    expect(res.shouldProcess).toBe(false);
  });

  it("rejects when the body is altered after signing", async () => {
    const tamperedBody = rawPayload.replace("10.00", "9999.00");
    const res = await provider.verifyWebhookSignature(baseConfig, validHeaders(rawPayload) as any, tamperedBody);
    expect(res.success).toBe(false);
  });

  it("rejects when no signing key is configured", async () => {
    const res = await provider.verifyWebhookSignature({ ...baseConfig, webhookKey: "" }, validHeaders(rawPayload) as any, rawPayload);
    expect(res.success).toBe(false);
    expect(res.shouldProcess).toBe(false);
  });

  it("rejects when the signature header is missing", async () => {
    const res = await provider.verifyWebhookSignature(baseConfig, {} as any, rawPayload);
    expect(res.success).toBe(false);
  });

  it("verifies but does not process an unhandled event type", async () => {
    const otherObj = { event_id: "evt_x", event_type: "transaction.void.success", event_body: {} };
    const raw = JSON.stringify(otherObj);
    const res = await provider.verifyWebhookSignature(baseConfig, validHeaders(raw) as any, raw);
    expect(res.success).toBe(true);
    expect(res.shouldProcess).toBe(false);
  });
});
