// Stub Environment (ESM-only import.meta.url) and axios for unit isolation.
jest.mock("../../Environment", () => ({ Environment: { membershipApi: "http://test" } }));
jest.mock("axios", () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));

import Axios from "axios";
import { KingdomFundingGatewayProvider } from "../KingdomFundingGatewayProvider";
import { GatewayConfig } from "../IGatewayProvider";

const mockedPost = (Axios as any).post as jest.Mock;

// Money-unit contract: the client sends whole-dollar amounts and each provider
// adapter converts to its API's wire unit. Stripe converts dollars->cents inside
// StripeHelper (see StripeHelper.currency.test.ts); Accept Blue / KingdomFunding
// takes dollars, so the adapter must forward the amount unscaled.
describe("KingdomFundingGatewayProvider.processCharge amount units", () => {
  const provider = new KingdomFundingGatewayProvider();
  const config = { privateKey: "sk_sandbox_key", settings: {} } as GatewayConfig;

  beforeEach(() => {
    mockedPost.mockReset();
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it("forwards whole-dollar amounts to Accept Blue without converting to cents", async () => {
    mockedPost.mockResolvedValue({ data: { status: "Approved", reference_number: "100200", auth_amount: 25 } });
    const result = await provider.processCharge(config, {
      amount: 25,
      type: "card",
      id: "nonce-abc",
      person: { email: "a@b.com", firstName: "A", lastName: "B" }
    });
    expect(result.success).toBe(true);
    expect(mockedPost).toHaveBeenCalledTimes(1);
    const [url, payload] = mockedPost.mock.calls[0];
    expect(url).toContain("/transactions/charge");
    expect(payload.amount).toBe(25); // dollars, NOT 2500 cents
  });

  it("preserves cents within the dollar amount (no scaling, no truncation)", async () => {
    mockedPost.mockResolvedValue({ data: { status: "Approved", reference_number: "1" } });
    await provider.processCharge(config, { amount: 12.5, type: "card", id: "nonce-x" });
    expect(mockedPost.mock.calls[0][1].amount).toBe(12.5);
  });
});
