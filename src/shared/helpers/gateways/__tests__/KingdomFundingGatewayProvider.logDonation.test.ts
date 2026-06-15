// Stub Environment (ESM-only import.meta.url) for ts-jest's commonjs transform.
jest.mock("../../Environment", () => ({ Environment: { membershipApi: "http://test" } }));

import { KingdomFundingGatewayProvider } from "../KingdomFundingGatewayProvider";
import { GatewayConfig } from "../IGatewayProvider";

// A webhook-created donation (recurring auto-charge / ACH settlement) arrives with no fund
// data, so logDonation must recover the allocation — otherwise the money is recorded but
// left unallocated and fund reports undercount.
describe("KingdomFundingGatewayProvider.logDonation fund recovery", () => {
  const provider = new KingdomFundingGatewayProvider();

  const makeRepos = (overrides: any = {}) => ({
    customer: { load: jest.fn().mockResolvedValue(null) },
    donation: {
      loadByTransactionId: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation(async (d: any) => ({ ...d, id: "don1" }))
    },
    donationBatch: { getOrCreateCurrent: jest.fn().mockResolvedValue({ id: "batch1" }) },
    fundDonation: { save: jest.fn().mockResolvedValue({}) },
    subscription: { loadByCustomerId: jest.fn().mockResolvedValue([]) },
    subscriptionFunds: { loadBySubscriptionId: jest.fn().mockResolvedValue([]) },
    fund: { getOrCreateGeneral: jest.fn().mockResolvedValue({ id: "general" }) },
    ...overrides
  });

  beforeEach(() => jest.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => jest.restoreAllMocks());

  it("recovers fund splits from the donor's subscription when the webhook carries none", async () => {
    const repos = makeRepos({
      subscription: { loadByCustomerId: jest.fn().mockResolvedValue([{ id: "sub1" }]) },
      subscriptionFunds: { loadBySubscriptionId: jest.fn().mockResolvedValue([{ fundId: "f1", amount: 60 }, { fundId: "f2", amount: 40 }]) }
    });
    // auth_amount 103 (donor covered ~$3 fee) vs designated total 100 — still the right subscription.
    const eventData = { auth_amount: 103, customer: { customer_id: "cust1" }, reference_number: 555 };

    await provider.logDonation({} as GatewayConfig, "ch1", eventData, repos, "complete");

    expect(repos.subscription.loadByCustomerId).toHaveBeenCalledWith("ch1", "cust1");
    expect(repos.fund.getOrCreateGeneral).not.toHaveBeenCalled();
    const saved = repos.fundDonation.save.mock.calls.map((c: any[]) => c[0]);
    expect(saved).toEqual(expect.arrayContaining([
      expect.objectContaining({ churchId: "ch1", donationId: "don1", fundId: "f1", amount: 60 }),
      expect.objectContaining({ fundId: "f2", amount: 40 })
    ]));
    expect(saved).toHaveLength(2);
  });

  it("falls back to the General Fund when no subscription is found (never leaves money unallocated)", async () => {
    const repos = makeRepos();
    const eventData = { auth_amount: 50, customer: { customer_id: "cust1" }, reference_number: 556 };

    await provider.logDonation({} as GatewayConfig, "ch1", eventData, repos, "complete");

    expect(repos.fund.getOrCreateGeneral).toHaveBeenCalledWith("ch1");
    expect(repos.fundDonation.save).toHaveBeenCalledTimes(1);
    expect(repos.fundDonation.save.mock.calls[0][0]).toEqual(
      expect.objectContaining({ fundId: "general", amount: 50, donationId: "don1" })
    );
  });

  it("uses the funds supplied by the synchronous /charge path and skips recovery", async () => {
    const repos = makeRepos();
    const eventData = { auth_amount: 75, funds: [{ id: "fa", amount: 75 }], reference_number: 557 };

    await provider.logDonation({} as GatewayConfig, "ch1", eventData, repos, "complete");

    expect(repos.subscription.loadByCustomerId).not.toHaveBeenCalled();
    expect(repos.fund.getOrCreateGeneral).not.toHaveBeenCalled();
    expect(repos.fundDonation.save).toHaveBeenCalledTimes(1);
    expect(repos.fundDonation.save.mock.calls[0][0]).toEqual(expect.objectContaining({ fundId: "fa", amount: 75 }));
  });
});
