import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen_id" } }));

import { getDb } from "../../db/index.js";
import { ArrangementRepo } from "../ArrangementRepo.js";

function recordingDb(rows: unknown[]) {
  const calls: { method: string; args: unknown[] }[] = [];
  const proxy: Record<string, unknown> = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (prop === "execute") return async () => rows;
      return (...args: unknown[]) => { calls.push({ method: prop as string, args }); return proxy; };
    }
  });
  return { proxy, calls };
}

describe("ArrangementRepo.loadFreeShowIds", () => {
  afterEach(() => jest.restoreAllMocks());

  it("selects only freeShowId for the church and drops blank ids", async () => {
    const { proxy, calls } = recordingDb([{ freeShowId: "a" }, { freeShowId: "" }, { freeShowId: "b" }]);
    (getDb as jest.Mock).mockReturnValue(proxy);

    const ids = await new ArrangementRepo().loadFreeShowIds("c1");

    expect(ids).toEqual(["a", "b"]);
    expect(calls.find((c) => c.method === "selectFrom")?.args[0]).toBe("arrangements as a");
    expect(calls.find((c) => c.method === "select")?.args[0]).toEqual(["a.freeShowId"]);
    expect(calls.some((c) => c.method === "selectAll")).toBe(false);
    expect(calls.find((c) => c.method === "where" && c.args[0] === "a.churchId")?.args).toEqual(["a.churchId", "=", "c1"]);
    expect(calls.find((c) => c.method === "where" && c.args[0] === "a.freeShowId")?.args).toEqual(["a.freeShowId", "is not", null]);
  });

  it("only counts arrangements whose song still exists (FreeShow#3999)", async () => {
    const { proxy, calls } = recordingDb([]);
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new ArrangementRepo().loadFreeShowIds("c1");
    expect(calls.find((c) => c.method === "innerJoin")?.args[0]).toBe("songs as s");
  });
});

describe("ArrangementRepo song-scoped FreeShow lookups", () => {
  it.each([
    ["loadByFreeShowId", ["c1", "fs1"], "a.freeShowId"],
    ["loadBySongDetailId", ["c1", "sd1"], "a.songDetailId"]
  ])("%s joins live songs and selects only arrangement columns", async (method, args, column) => {
    const { proxy, calls } = recordingDb([]);
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new ArrangementRepo()[method as "loadByFreeShowId" | "loadBySongDetailId"](args[0], args[1]);
    expect(calls.find((c) => c.method === "innerJoin")?.args[0]).toBe("songs as s");
    expect(calls.find((c) => c.method === "selectAll")?.args).toEqual(["a"]);
    expect(calls.find((c) => c.method === "where" && c.args[0] === column)?.args).toEqual([column, "=", args[1]]);
  });
});
