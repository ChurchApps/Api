// Stub Environment (ESM-only import.meta.url) and axios for unit isolation.
jest.mock("../../Environment", () => ({ Environment: { membershipApi: "http://test" } }));
jest.mock("axios", () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));

import Axios from "axios";
import { KingdomFundingGatewayProvider } from "../KingdomFundingGatewayProvider";
import { GatewayConfig } from "../IGatewayProvider";

const mockedPost = (Axios as any).post as jest.Mock;
const provider = new KingdomFundingGatewayProvider();
const config = { privateKey: "sk", settings: {} } as GatewayConfig;

// Far-future anchor so the schedule does NOT start today (skips the charge-today call):
// 2 posts only — [0] add_customer (vault), [1] add_subscription.
const FUTURE_ANCHOR = Math.floor(new Date("2099-06-15T00:00:00Z").getTime() / 1000);

const bodyOf = (callIndex: number) => new URLSearchParams(mockedPost.mock.calls[callIndex][1]);
const findCall = (predicate: (p: URLSearchParams) => boolean) =>
  mockedPost.mock.calls.map((c) => new URLSearchParams(c[1])).find(predicate);

beforeEach(() => {
  mockedPost.mockReset();
  mockedPost.mockResolvedValue({ data: "response=1&customer_vault_id=v1&subscription_id=sub1&transactionid=tx1" });
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe("KingdomFundingGatewayProvider.createSubscription interval mapping (NMI)", () => {
  const run = (interval: any) =>
    provider.createSubscription(config, { amount: 10, interval, id: "tok-collectjs-1234567890-abc", billing_cycle_anchor: FUTURE_ANCHOR, person: { name: "A B", email: "a@b.com" } });

  // The frontend sends an OBJECT { interval_count, interval: <bare unit> } (DonationHelper.getInterval).
  it("biweekly -> day_frequency 14 (count*7), no month_frequency", async () => {
    const r = await run({ interval_count: 2, interval: "week" });
    expect(r.success).toBe(true);
    const sub = findCall((p) => p.get("recurring") === "add_subscription")!;
    expect(sub.get("day_frequency")).toBe("14");
    expect(sub.get("month_frequency")).toBeNull();
  });

  it("quarterly -> month_frequency 3", async () => {
    await run({ interval_count: 3, interval: "month" });
    const sub = findCall((p) => p.get("recurring") === "add_subscription")!;
    expect(sub.get("month_frequency")).toBe("3");
    expect(sub.get("day_frequency")).toBeNull();
  });

  it("annually -> month_frequency 12", async () => {
    await run({ interval_count: 1, interval: "year" });
    const sub = findCall((p) => p.get("recurring") === "add_subscription")!;
    expect(sub.get("month_frequency")).toBe("12");
  });

  it("weekly -> day_frequency 7", async () => {
    await run({ interval_count: 1, interval: "week" });
    expect(findCall((p) => p.get("recurring") === "add_subscription")!.get("day_frequency")).toBe("7");
  });

  // Legacy string form must still map correctly (fallback path).
  it("legacy string 'biweekly' -> day_frequency 14", async () => {
    await run("biweekly");
    expect(findCall((p) => p.get("recurring") === "add_subscription")!.get("day_frequency")).toBe("14");
  });

  it("vaults the fresh token then schedules against the returned customer_vault_id", async () => {
    await run({ interval_count: 1, interval: "month" });
    expect(bodyOf(0).get("customer_vault")).toBe("add_customer");
    expect(bodyOf(0).get("payment_token")).toBe("tok-collectjs-1234567890-abc");
    expect(findCall((p) => p.get("recurring") === "add_subscription")!.get("customer_vault_id")).toBe("v1");
  });
});

describe("KingdomFundingGatewayProvider.attachPaymentMethod (NMI)", () => {
  it("strips a legacy 'nonce-' prefix before sending payment_token to NMI", async () => {
    const pm = await provider.attachPaymentMethod(config, "nonce-tok123", { customerId: "v1", name: "A B" });
    const call = findCall((p) => p.get("customer_vault") === "add_billing")!;
    expect(call.get("payment_token")).toBe("tok123"); // not "nonce-tok123"
    expect(pm.id).toBe("v1"); // persisted id is the customer_vault_id
  });
});
