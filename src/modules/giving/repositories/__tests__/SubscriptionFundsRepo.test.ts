import "reflect-metadata";

let rows: any[] = [];
jest.mock("kysely", () => ({ sql: () => ({ execute: async () => ({ rows }) }) }));
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "x" } }));

import { SubscriptionFundsRepo } from "../SubscriptionFundsRepo";

describe("SubscriptionFundsRepo.loadForSubscriptionLog", () => {
  it("returns every fund of a split recurring gift, swapping only a removed fund for the general fund", async () => {
    rows = [
      { id: "sf1", fundId: "f1", amount: 60, name: "Missions", removed: false },
      { id: "sf2", fundId: "f2", amount: 40, name: "Old", removed: true }
    ];
    const repo = new SubscriptionFundsRepo();
    const getOrCreateGeneral = jest.fn(async () => ({ id: "gen", name: "(General Fund)" }));
    (repo as any).fundRepository = { getOrCreateGeneral };
    const result = await repo.loadForSubscriptionLog("C1", "sub_1");
    expect(result).toEqual([
      { id: "sf1", fundId: "f1", amount: 60, name: "Missions" },
      { id: "sf2", fundId: "gen", amount: 40, name: "(General Fund)" }
    ]);
    expect(getOrCreateGeneral).toHaveBeenCalledTimes(1);
  });

  it("does not create a general fund when every fund is live", async () => {
    rows = [{ id: "sf1", fundId: "f1", amount: 25, name: "Missions", removed: false }];
    const repo = new SubscriptionFundsRepo();
    const getOrCreateGeneral = jest.fn();
    (repo as any).fundRepository = { getOrCreateGeneral };
    expect(await repo.loadForSubscriptionLog("C1", "sub_1")).toEqual([{ id: "sf1", fundId: "f1", amount: 25, name: "Missions" }]);
    expect(getOrCreateGeneral).not.toHaveBeenCalled();
  });
});
