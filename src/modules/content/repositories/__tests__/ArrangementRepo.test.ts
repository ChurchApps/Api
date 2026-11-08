import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen_id" } }));

import { getDb } from "../../db/index.js";
import { ArrangementRepo } from "../ArrangementRepo.js";

function recordingDb(rows: any[]) {
  const calls: { method: string; args: any[] }[] = [];
  const proxy: any = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (prop === "execute") return async () => rows;
      return (...args: any[]) => { calls.push({ method: prop as string, args }); return proxy; };
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
    expect(calls.find((c) => c.method === "selectFrom")?.args[0]).toBe("arrangements");
    expect(calls.find((c) => c.method === "select")?.args[0]).toEqual(["freeShowId"]);
    expect(calls.some((c) => c.method === "selectAll")).toBe(false);
    expect(calls.find((c) => c.method === "where" && c.args[0] === "churchId")?.args).toEqual(["churchId", "=", "c1"]);
    expect(calls.find((c) => c.method === "where" && c.args[0] === "freeShowId")?.args).toEqual(["freeShowId", "is not", null]);
  });
});
