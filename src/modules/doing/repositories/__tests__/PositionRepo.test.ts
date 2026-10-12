import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen_id" } }));

import { getDb } from "../../db/index.js";
import { PositionRepo } from "../PositionRepo.js";

function recordingDb() {
  const calls: { method: string; args: any[] }[] = [];
  const proxy: any = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (prop === "execute") return async () => [];
      if (prop === "executeTakeFirst") return async () => null;
      return (...args: any[]) => { calls.push({ method: prop as string, args }); return proxy; };
    }
  });
  return { proxy, calls };
}

const orderBys = (calls: { method: string; args: any[] }[]) => calls.filter((c) => c.method === "orderBy").map((c) => c.args[0]);

describe("PositionRepo sort order", () => {
  afterEach(() => jest.restoreAllMocks());

  // Backs /plans/public/signup; must match the admin order from loadByPlanId (#1245).
  it("sorts loadByPlanIds by category, then name", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new PositionRepo().loadByPlanIds("c1", ["pl1", "pl2"]);
    expect(orderBys(calls)).toEqual(["categoryName", "name"]);
  });

  it("sorts loadByPlanId by category, then name", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new PositionRepo().loadByPlanId("c1", "pl1");
    expect(orderBys(calls)).toEqual(["categoryName", "name"]);
  });
});
