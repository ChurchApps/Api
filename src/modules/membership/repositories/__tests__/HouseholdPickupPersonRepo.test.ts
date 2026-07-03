import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "hpp_gen" } }));

import { getDb } from "../../db/index.js";
import { HouseholdPickupPersonRepo } from "../HouseholdPickupPersonRepo.js";

// Records every builder call so we can assert every query is scoped by churchId (+ householdId).
function recordingDb() {
  const wheres: { col: any; op: any; val: any }[] = [];
  const proxy: any = new Proxy({}, {
    get(_t, prop) {
      if (prop === "execute") return async () => [];
      if (prop === "executeTakeFirst") return async () => null;
      if (prop === "where") return (col: any, op: any, val: any) => { wheres.push({ col, op, val }); return proxy; };
      return () => proxy;
    }
  });
  return { proxy, wheres };
}

describe("HouseholdPickupPersonRepo scoping", () => {
  it("loadByHousehold filters on churchId AND householdId (no cross-church/household leak)", async () => {
    const { proxy, wheres } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new HouseholdPickupPersonRepo().loadByHousehold("church1", "house1");
    expect(wheres).toContainEqual({ col: "churchId", op: "=", val: "church1" });
    expect(wheres).toContainEqual({ col: "householdId", op: "=", val: "house1" });
  });

  it("load is churchId-scoped", async () => {
    const { proxy, wheres } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new HouseholdPickupPersonRepo().load("church1", "id1");
    expect(wheres).toContainEqual({ col: "churchId", op: "=", val: "church1" });
    expect(wheres).toContainEqual({ col: "id", op: "=", val: "id1" });
  });

  it("delete is churchId-scoped (cannot delete another church's row by id)", async () => {
    const { proxy, wheres } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new HouseholdPickupPersonRepo().delete("church1", "id1");
    expect(wheres).toContainEqual({ col: "churchId", op: "=", val: "church1" });
    expect(wheres).toContainEqual({ col: "id", op: "=", val: "id1" });
  });
});
