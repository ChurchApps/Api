import "reflect-metadata";

const calls: string[] = [];
const execute = jest.fn(async () => { calls.push("insert"); });
const db = { insertInto: () => ({ values: () => ({ execute }) }) };
jest.mock("../../db/index", () => ({ getDb: () => db }));
const emitMock = jest.fn(async () => { calls.push("emit"); });
jest.mock("../../../../shared/webhooks/index", () => ({ __esModule: true, WebhookDispatcher: { emit: emitMock } }));
const fundSaveMock = jest.fn(async (sf: SubscriptionFund) => { calls.push("fund:" + sf.fundId); return sf; });
jest.mock("../SubscriptionFundsRepo", () => ({ __esModule: true, SubscriptionFundsRepo: class { save = fundSaveMock; } }));

import { SubscriptionRepo } from "../SubscriptionRepo";
import type { SubscriptionFund } from "../../models/index.js";

describe("SubscriptionRepo.save", () => {
  beforeEach(() => { calls.length = 0; emitMock.mockClear(); fundSaveMock.mockClear(); });

  it("writes the fund rows, then fires subscription.created once", async () => {
    const interval = { interval_count: 1, interval: "month" };
    const saved = await new SubscriptionRepo().save(
      { id: "sub_1", churchId: "c1", personId: "p1", customerId: "cus_1", amount: 75, interval },
      [{ fundId: "f1", amount: 50 }, { fundId: "f2", amount: 25 }]
    );

    expect(calls).toEqual(["insert", "fund:f1", "fund:f2", "emit"]);
    expect(fundSaveMock).toHaveBeenCalledWith({ churchId: "c1", subscriptionId: "sub_1", fundId: "f1", amount: 50 });
    expect(emitMock).toHaveBeenCalledTimes(1);
    expect(emitMock).toHaveBeenCalledWith("c1", "subscription.created", expect.objectContaining({
      id: "sub_1",
      personId: "p1",
      amount: 75,
      interval,
      subscriptionFunds: [expect.objectContaining({ fundId: "f1" }), expect.objectContaining({ fundId: "f2" })]
    }));
    expect(saved.id).toBe("sub_1");
  });
});
