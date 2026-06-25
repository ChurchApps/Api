// Stub Environment (ESM-only import.meta.url) and axios for unit isolation.
jest.mock("../../Environment", () => ({ Environment: { membershipApi: "http://test" } }));
jest.mock("axios", () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));

import Axios from "axios";
import { KingdomFundingGatewayProvider } from "../KingdomFundingGatewayProvider";
import { GatewayConfig } from "../IGatewayProvider";

const mockedPost = (Axios as any).post as jest.Mock;

// NMI posts form-urlencoded; the body is a string. Parse it back to inspect fields.
const bodyParams = (call: any[]): URLSearchParams => new URLSearchParams(call[1]);

describe("KingdomFundingGatewayProvider.processCharge (NMI)", () => {
  const provider = new KingdomFundingGatewayProvider();
  const config = { privateKey: "sk_sandbox_key", settings: {} } as GatewayConfig;

  beforeEach(() => {
    mockedPost.mockReset();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  // Money-unit contract: the client sends whole-dollar amounts and each provider
  // adapter converts to its API's wire unit. Stripe converts dollars->cents; NMI
  // takes dollars formatted as a 2-decimal string (e.g. "25.00"), never cents.
  it("sends whole-dollar amounts to NMI as a 2-decimal string, not cents", async () => {
    mockedPost.mockResolvedValue({ data: "response=1&transactionid=100200" });
    const result = await provider.processCharge(config, {
      amount: 25,
      type: "card",
      id: "tok-abc-1234567890-xyz",
      person: { email: "a@b.com", firstName: "A", lastName: "B" }
    });
    expect(result.success).toBe(true);
    expect(result.transactionId).toBe("100200");
    expect(mockedPost).toHaveBeenCalledTimes(1);
    const [url] = mockedPost.mock.calls[0];
    expect(url).toContain("transact.php");
    expect(bodyParams(mockedPost.mock.calls[0]).get("amount")).toBe("25.00"); // dollars, NOT 2500
  });

  it("preserves cents within the dollar amount (no scaling, no truncation)", async () => {
    mockedPost.mockResolvedValue({ data: "response=1&transactionid=1" });
    await provider.processCharge(config, { amount: 12.5, type: "card", id: "tok-x" });
    expect(bodyParams(mockedPost.mock.calls[0]).get("amount")).toBe("12.50");
  });

  // Source resolution is the contract that keeps the giving controllers provider-agnostic:
  // a fresh Collect.js token charges via payment_token; a saved method (paymentMethodId)
  // charges via customer_vault_id. NMI tokens and vault ids are both GUID-shaped, so this
  // must be driven by explicit fields, never a shape heuristic.
  it("charges a fresh token via payment_token", async () => {
    mockedPost.mockResolvedValue({ data: "response=1&transactionid=1" });
    await provider.processCharge(config, { amount: 10, type: "card", id: "collectjs-token-123" });
    const p = bodyParams(mockedPost.mock.calls[0]);
    expect(p.get("payment_token")).toBe("collectjs-token-123");
    expect(p.get("customer_vault_id")).toBeNull();
  });

  it("charges a saved method via customer_vault_id", async () => {
    mockedPost.mockResolvedValue({ data: "response=1&transactionid=1" });
    await provider.processCharge(config, { amount: 10, type: "card", paymentMethodId: "vault-uuid-1", id: "ignored-when-saved" });
    const p = bodyParams(mockedPost.mock.calls[0]);
    expect(p.get("customer_vault_id")).toBe("vault-uuid-1");
    expect(p.get("payment_token")).toBeNull();
  });

  it("surfaces an NMI decline as a failed ChargeResult", async () => {
    mockedPost.mockResolvedValue({ data: "response=2&responsetext=DECLINE" });
    const result = await provider.processCharge(config, { amount: 10, type: "card", id: "tok-x" });
    expect(result.success).toBe(false);
    expect(result.data.error).toBe("DECLINE");
  });
});
