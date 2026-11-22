import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen_id" } }));

import { getDb } from "../../db/index.js";
import { ArrangementKeyRepo } from "../ArrangementKeyRepo.js";

type Call = { method: string; args: unknown[] };

// Each query builder chain is recorded separately so a test can tell the select from the delete.
function recordingDb(selectRows: { id: string }[]) {
  const queries: Call[][] = [];
  const chain = (first: string, args: unknown[]): object => {
    const calls: Call[] = [{ method: first, args }];
    queries.push(calls);
    const proxy: object = new Proxy({}, {
      get(_t, prop) {
        if (typeof prop === "symbol" || prop === "then") return undefined;
        if (prop === "execute") return async () => (first === "selectFrom" ? selectRows : []);
        return (...a: unknown[]) => { calls.push({ method: prop, args: a }); return proxy; };
      }
    });
    return proxy;
  };
  const db = { selectFrom: (...a: unknown[]) => chain("selectFrom", a), deleteFrom: (...a: unknown[]) => chain("deleteFrom", a) };
  return { db, queries };
}

const whereArgs = (calls: Call[]) => calls.filter((c) => c.method === "where").map((c) => c.args);

describe("ArrangementKeyRepo.deleteForArrangement", () => {
  afterEach(() => jest.restoreAllMocks());

  it("deletes the arrangement's keys by primary key, scoped to the church", async () => {
    const { db, queries } = recordingDb([{ id: "k1" }, { id: "k2" }]);
    (getDb as jest.Mock).mockReturnValue(db);

    await new ArrangementKeyRepo().deleteForArrangement("c1", "a1");

    const select = queries.find((q) => q[0].method === "selectFrom");
    expect(select[0].args[0]).toBe("arrangementKeys");
    expect(whereArgs(select)).toEqual([["churchId", "=", "c1"], ["arrangementId", "=", "a1"]]);

    const deletes = queries.filter((q) => q[0].method === "deleteFrom");
    expect(deletes).toHaveLength(1);
    expect(deletes[0][0].args[0]).toBe("arrangementKeys");
    expect(whereArgs(deletes[0])).toEqual([["churchId", "=", "c1"], ["id", "in", ["k1", "k2"]]]);
  });

  // arrangementKeys has no index on arrangementId, so a DELETE filtered by it scans the whole
  // table and locks every row it reads: concurrent deletes from any church queue one at a time.
  it("never filters a DELETE by arrangementId", async () => {
    const { db, queries } = recordingDb([{ id: "k1" }]);
    (getDb as jest.Mock).mockReturnValue(db);

    await new ArrangementKeyRepo().deleteForArrangement("c1", "a1");

    for (const q of queries.filter((x) => x[0].method === "deleteFrom")) {
      expect(whereArgs(q).some((a) => a[0] === "arrangementId")).toBe(false);
    }
  });

  it("runs no DELETE when the arrangement has no keys", async () => {
    const { db, queries } = recordingDb([]);
    (getDb as jest.Mock).mockReturnValue(db);

    await new ArrangementKeyRepo().deleteForArrangement("c1", "a1");

    expect(queries.filter((q) => q[0].method === "deleteFrom")).toHaveLength(0);
  });
});
