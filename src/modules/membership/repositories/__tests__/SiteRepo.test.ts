import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "site_gen" } }));

import { getDb } from "../../db/index.js";
import { SiteRepo } from "../SiteRepo.js";

interface Call {
  method: string;
  args: unknown[];
}

function recordingDb(results: { execute?: unknown; executeTakeFirst?: unknown } = {}) {
  const calls: Call[] = [];
  const proxy: Record<string, unknown> = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (prop === "execute") return async () => results.execute ?? [];
      if (prop === "executeTakeFirst") return async () => results.executeTakeFirst ?? null;
      return (...args: unknown[]) => { calls.push({ method: prop as string, args }); return proxy; };
    }
  });
  return { proxy, calls };
}
const firstArg = (calls: Call[], method: string) => calls.find((c) => c.method === method)?.args[0];
const whereCalls = (calls: Call[]) => calls.filter((c) => c.method === "where");

describe("SiteRepo persistence", () => {
  afterEach(() => jest.restoreAllMocks());

  it("create writes id/churchId/name/subDomain with a generated id", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new SiteRepo().save({ churchId: "c1", name: "Main", subDomain: "main" });
    expect(firstArg(calls, "insertInto")).toBe("sites");
    expect(firstArg(calls, "values")).toEqual({ id: "site_gen", churchId: "c1", name: "Main", subDomain: "main" });
  });

  it("delete is scoped by id and churchId", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new SiteRepo().delete("c1", "s1");
    expect(firstArg(calls, "deleteFrom")).toBe("sites");
    const wheres = whereCalls(calls);
    expect(wheres.some((c) => c.args[0] === "id" && c.args[2] === "s1")).toBe(true);
    expect(wheres.some((c) => c.args[0] === "churchId" && c.args[2] === "c1")).toBe(true);
  });

  it("loadBySubDomain queries the global namespace with no churchId filter", async () => {
    const { proxy, calls } = recordingDb({ executeTakeFirst: null });
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new SiteRepo().loadBySubDomain("main");
    const wheres = whereCalls(calls);
    expect(wheres.some((c) => c.args[0] === "subDomain" && c.args[2] === "main")).toBe(true);
    expect(wheres.some((c) => c.args[0] === "churchId")).toBe(false);
  });
});
