import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen_id" } }));

import { getDb } from "../../db/index.js";
import { PlanItemRepo } from "../PlanItemRepo.js";

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

const firstArg = (calls: { method: string; args: any[] }[], method: string) => calls.find((c) => c.method === method)?.args[0];

describe("PlanItemRepo positionId", () => {
  afterEach(() => jest.restoreAllMocks());

  it("persists positionId on create", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    const saved = await new PlanItemRepo().save({ churchId: "c1", planId: "pl1", label: "Sermon", positionId: "pos1" });
    expect(saved.id).toBe("gen_id");
    expect(firstArg(calls, "insertInto")).toBe("planItems");
    expect(firstArg(calls, "values")).toMatchObject({ id: "gen_id", planId: "pl1", positionId: "pos1" });
  });

  it("persists positionId on update", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new PlanItemRepo().save({ id: "pi1", churchId: "c1", planId: "pl1", label: "Sermon", positionId: "pos2" });
    expect(calls.some((c) => c.method === "insertInto")).toBe(false);
    expect(firstArg(calls, "updateTable")).toBe("planItems");
    expect(firstArg(calls, "set")).toMatchObject({ positionId: "pos2" });
  });

  it("clears positionId on update when the saved item no longer has one", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new PlanItemRepo().save({ id: "pi1", churchId: "c1", planId: "pl1", label: "Sermon" });
    const set = firstArg(calls, "set");
    expect(set).toHaveProperty("positionId");
    expect(set.positionId).toBeNull();
  });
});
