// Stub the Environment helper because it uses ESM-only `import.meta.url`,
// which can't be loaded under ts-jest's commonjs transform.
jest.mock("../../Environment", () => ({ Environment: { membershipApi: "http://test" } }));

import crypto from "crypto";
import { KingdomFundingGatewayProvider } from "../KingdomFundingGatewayProvider";
import { GatewayConfig } from "../IGatewayProvider";

describe("KingdomFundingGatewayProvider.verifyWebhookSignature", () => {
  const provider = new KingdomFundingGatewayProvider();
  const secret = "test-webhook-secret";
  const config = { webhookKey: secret } as GatewayConfig;

  const sign = (raw: string, key: string = secret) =>
    crypto.createHmac("sha256", key).update(raw, "utf-8").digest("hex");

  const event = {
    type: "succeeded",
    subType: "charge",
    event: "transaction",
    id: "evt_1",
    data: { reference_number: 12345, status: "Approved", auth_amount: 50, card_type: "Visa", last_4: "4242" }
  };
  const rawBody = JSON.stringify(event);

  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("verifies a signed raw string body and yields parsed event fields", async () => {
    const result = await provider.verifyWebhookSignature(config, { "x-signature": sign(rawBody) }, rawBody);
    expect(result.success).toBe(true);
    expect(result.shouldProcess).toBe(true);
    expect(result.eventType).toBe("succeeded.charge");
    expect(result.eventId).toBe("evt_1");
    expect(result.eventData.id).toBe(12345);
    expect(result.eventData.auth_amount).toBe(50);
    expect(result.eventData.last_4).toBe("4242");
  });

  it("verifies a signed raw Buffer body (local dev bodyParser.raw)", async () => {
    const result = await provider.verifyWebhookSignature(config, { "x-signature": sign(rawBody) }, Buffer.from(rawBody, "utf-8"));
    expect(result.success).toBe(true);
    expect(result.shouldProcess).toBe(true);
    expect(result.eventType).toBe("succeeded.charge");
    expect(result.eventData.id).toBe(12345);
  });

  it("flags ACH status events for processing", async () => {
    const settled = JSON.stringify({ ...event, type: "status", subType: "settled" });
    const result = await provider.verifyWebhookSignature(config, { "x-signature": sign(settled) }, settled);
    expect(result.success).toBe(true);
    expect(result.shouldProcess).toBe(true);
    expect(result.eventType).toBe("status.settled");
  });

  it("does not process non-transaction events", async () => {
    const batchClosed = JSON.stringify({ ...event, event: "batch", type: "closed", subType: "" });
    const result = await provider.verifyWebhookSignature(config, { "x-signature": sign(batchClosed) }, batchClosed);
    expect(result.success).toBe(true);
    expect(result.shouldProcess).toBe(false);
  });

  it("rejects when no webhook secret is configured", async () => {
    const result = await provider.verifyWebhookSignature({ webhookKey: "" } as GatewayConfig, { "x-signature": sign(rawBody) }, rawBody);
    expect(result).toEqual({ success: false, shouldProcess: false });
  });

  it("rejects when the X-Signature header is missing", async () => {
    const result = await provider.verifyWebhookSignature(config, {}, rawBody);
    expect(result).toEqual({ success: false, shouldProcess: false });
  });

  it("rejects a body signed with the wrong secret", async () => {
    const result = await provider.verifyWebhookSignature(config, { "x-signature": sign(rawBody, "wrong-secret") }, rawBody);
    expect(result).toEqual({ success: false, shouldProcess: false });
  });

  it("rejects a non-hex / wrong-length signature without throwing", async () => {
    const result = await provider.verifyWebhookSignature(config, { "x-signature": "not-a-hex-sig" }, rawBody);
    expect(result).toEqual({ success: false, shouldProcess: false });
  });

  it("rejects a correctly signed but malformed JSON body", async () => {
    const malformed = "{ not json";
    const result = await provider.verifyWebhookSignature(config, { "x-signature": sign(malformed) }, malformed);
    expect(result).toEqual({ success: false, shouldProcess: false });
  });
});
