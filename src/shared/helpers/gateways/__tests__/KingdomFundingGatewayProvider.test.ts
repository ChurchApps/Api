// Stub the Environment helper because it uses ESM-only `import.meta.url`,
// which can't be loaded under ts-jest's commonjs transform.
jest.mock("../../Environment", () => ({ Environment: { membershipApi: "http://test" } }));

import crypto from "crypto";
import { KingdomFundingGatewayProvider } from "../KingdomFundingGatewayProvider";
import { GatewayConfig } from "../IGatewayProvider";

describe("KingdomFundingGatewayProvider.verifyWebhookSignature (NMI)", () => {
  const provider = new KingdomFundingGatewayProvider();
  const secret = "test-webhook-secret";
  const config = { webhookKey: secret } as GatewayConfig;

  // NMI signs `<nonce>.<rawBody>` with HMAC-SHA256 and sends `Webhook-Signature: t=<nonce>,s=<hex>`.
  const sigHeader = (raw: string, key: string = secret, nonce = "abc123") => {
    const s = crypto.createHmac("sha256", key).update(`${nonce}.${raw}`, "utf-8").digest("hex");
    return `t=${nonce},s=${s}`;
  };

  const saleEvent = {
    event_id: "evt_1",
    event_type: "transaction.sale.success",
    event_body: { transaction: { transaction_id: "12345", amount: "50.00", cc_type: "Visa", cc_last_4: "4242", customer_vault_id: "v-1" } }
  };
  const rawBody = JSON.stringify(saleEvent);

  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("verifies a signed card sale and normalizes it to succeeded.charge", async () => {
    const result = await provider.verifyWebhookSignature(config, { "webhook-signature": sigHeader(rawBody) }, rawBody);
    expect(result.success).toBe(true);
    expect(result.shouldProcess).toBe(true);
    expect(result.eventType).toBe("succeeded.charge");
    expect(result.eventId).toBe("evt_1");
    expect(result.eventData.id).toBe("12345");
    expect(result.eventData.reference_number).toBe("12345");
    expect(result.eventData.amount).toBe("50.00");
    expect(result.eventData.last_4).toBe("4242");
    expect(result.eventData.paymentType).toBe("card");
    expect(result.eventData.customer_vault_id).toBe("v-1");
  });

  it("verifies a signed raw Buffer body (local dev bodyParser.raw)", async () => {
    const result = await provider.verifyWebhookSignature(config, { "webhook-signature": sigHeader(rawBody) }, Buffer.from(rawBody, "utf-8"));
    expect(result.success).toBe(true);
    expect(result.shouldProcess).toBe(true);
    expect(result.eventType).toBe("succeeded.charge");
    expect(result.eventData.id).toBe("12345");
  });

  it("normalizes a settled ACH event to status.settled and processes it", async () => {
    const settled = JSON.stringify({
      event_id: "evt_2",
      event_type: "check.status.settled",
      event_body: { transaction: { transaction_id: "777", amount: "25.00", check_account: "1234567890" } }
    });
    const result = await provider.verifyWebhookSignature(config, { "webhook-signature": sigHeader(settled) }, settled);
    expect(result.success).toBe(true);
    expect(result.shouldProcess).toBe(true);
    expect(result.eventType).toBe("status.settled");
    expect(result.eventData.paymentType).toBe("bank");
    expect(result.eventData.last_4).toBe("7890");
  });

  it("normalizes a pending ACH event to status.originated and does NOT process it yet", async () => {
    const pending = JSON.stringify({
      event_id: "evt_3",
      event_type: "check.status.pending",
      event_body: { transaction: { transaction_id: "888", amount: "25.00", check_account: "1234567890" } }
    });
    const result = await provider.verifyWebhookSignature(config, { "webhook-signature": sigHeader(pending) }, pending);
    expect(result.success).toBe(true);
    expect(result.shouldProcess).toBe(false);
    expect(result.eventType).toBe("status.originated");
  });

  it("does not process unrelated transaction events", async () => {
    const declined = JSON.stringify({ event_id: "evt_4", event_type: "transaction.sale.failure", event_body: { transaction: { transaction_id: "9" } } });
    const result = await provider.verifyWebhookSignature(config, { "webhook-signature": sigHeader(declined) }, declined);
    expect(result.success).toBe(true);
    expect(result.shouldProcess).toBe(false);
  });

  it("rejects when no webhook secret is configured", async () => {
    const result = await provider.verifyWebhookSignature({ webhookKey: "" } as GatewayConfig, { "webhook-signature": sigHeader(rawBody) }, rawBody);
    expect(result).toEqual({ success: false, shouldProcess: false });
  });

  it("rejects when the Webhook-Signature header is missing", async () => {
    const result = await provider.verifyWebhookSignature(config, {}, rawBody);
    expect(result).toEqual({ success: false, shouldProcess: false });
  });

  it("rejects a malformed signature header (no t=/s= parts)", async () => {
    const result = await provider.verifyWebhookSignature(config, { "webhook-signature": "garbage" }, rawBody);
    expect(result).toEqual({ success: false, shouldProcess: false });
  });

  it("rejects a body signed with the wrong secret", async () => {
    const result = await provider.verifyWebhookSignature(config, { "webhook-signature": sigHeader(rawBody, "wrong-secret") }, rawBody);
    expect(result).toEqual({ success: false, shouldProcess: false });
  });

  it("rejects a body signed under a different nonce than the header claims", async () => {
    // Signature computed over nonce "real" but header advertises nonce "fake" → mismatch.
    const s = crypto.createHmac("sha256", secret).update(`real.${rawBody}`, "utf-8").digest("hex");
    const result = await provider.verifyWebhookSignature(config, { "webhook-signature": `t=fake,s=${s}` }, rawBody);
    expect(result).toEqual({ success: false, shouldProcess: false });
  });

  it("rejects a non-hex / wrong-length signature without throwing", async () => {
    const result = await provider.verifyWebhookSignature(config, { "webhook-signature": "t=abc123,s=not-a-hex-sig" }, rawBody);
    expect(result).toEqual({ success: false, shouldProcess: false });
  });

  it("rejects a correctly signed but malformed JSON body", async () => {
    const malformed = "{ not json";
    const result = await provider.verifyWebhookSignature(config, { "webhook-signature": sigHeader(malformed) }, malformed);
    expect(result).toEqual({ success: false, shouldProcess: false });
  });
});
