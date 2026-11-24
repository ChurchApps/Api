import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen_id" } }));

import { getDb } from "../../db/index.js";
import { PlanItemRepo } from "../PlanItemRepo.js";
import type { PlanItem } from "../../models/index.js";

function recordingDb() {
  const calls: { method: string; args: unknown[] }[] = [];
  const proxy = new Proxy<Record<string, unknown>>({}, {
    get(_t, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (prop === "execute") return async () => [];
      if (prop === "executeTakeFirst") return async () => null;
      return (...args: unknown[]) => { calls.push({ method: prop as string, args }); return proxy; };
    }
  });
  return { proxy, calls };
}

const firstArg = (calls: { method: string; args: unknown[] }[], method: string) => calls.find((c) => c.method === method)?.args[0] as Partial<PlanItem> | undefined;

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

describe("PlanItemRepo.loadSongsByDateRange", () => {
  afterEach(() => jest.restoreAllMocks());

  it("selects only the church's song items on plans in the date range", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new PlanItemRepo().loadSongsByDateRange("c1", "2026-10-01", "2026-11-30");
    const wheres = calls.filter((c) => c.method === "where").map((c) => c.args.slice(0, 2));
    expect(wheres).toEqual(expect.arrayContaining([["pi.churchId", "="], ["pi.itemType", "in"], ["pi.relatedId", "is not"], ["p.serviceDate", ">="], ["p.serviceDate", "<="]]));
    expect(calls.find((c) => c.method === "where" && c.args[0] === "pi.churchId")?.args[2]).toBe("c1");
    expect(calls.find((c) => c.method === "where" && c.args[0] === "pi.itemType")?.args[2]).toEqual(["arrangementKey", "song"]);
    expect(calls.find((c) => c.method === "innerJoin")?.args[0]).toBe("plans as p");
  });
});
