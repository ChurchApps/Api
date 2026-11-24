import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen_id" } }));

import { getDb } from "../../db/index.js";
import { AssignmentRepo } from "../AssignmentRepo.js";

function recordingDb() {
  const calls: { method: string; args: unknown[] }[] = [];
  const proxy = new Proxy<Record<string, unknown>>({}, {
    get(_t, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (prop === "execute") return async () => [];
      return (...args: unknown[]) => { calls.push({ method: prop as string, args }); return proxy; };
    }
  });
  return { proxy, calls };
}

const wheres = (calls: { method: string; args: unknown[] }[]) => calls.filter((c) => c.method === "where" && typeof c.args[0] === "string").map((c) => c.args);

describe("AssignmentRepo picker queries", () => {
  afterEach(() => jest.resetAllMocks());

  it("loadLastServed narrows to the church and the given people", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new AssignmentRepo().loadLastServed("c1", { personIds: ["p1", "p2"], before: new Date("2026-12-06") });
    expect(wheres(calls)).toEqual(expect.arrayContaining([["a.churchId", "=", "c1"], ["a.personId", "in", ["p1", "p2"]]]));
  });

  it("loadLastServed with no options keeps the church-wide query auto-schedule uses", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new AssignmentRepo().loadLastServed("c1");
    expect(wheres(calls)).toEqual([["a.churchId", "=", "c1"]]);
  });

  it("loadSameDayForPeople narrows to the church and people, skipping the position being filled", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new AssignmentRepo().loadSameDayForPeople("c1", new Date("2026-12-06"), ["p1"], "pos1");
    expect(wheres(calls)).toEqual(expect.arrayContaining([["a.churchId", "=", "c1"], ["a.personId", "in", ["p1"]], ["a.positionId", "!=", "pos1"]]));
  });

  it("runs no query for an empty team", async () => {
    const repo = new AssignmentRepo();
    expect(await repo.loadLastServed("c1", { personIds: [] })).toEqual([]);
    expect(await repo.loadSameDayForPeople("c1", new Date(), [])).toEqual([]);
    expect(getDb).not.toHaveBeenCalled();
  });
});
