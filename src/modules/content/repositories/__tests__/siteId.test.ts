import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({
  __esModule: true,
  UniqueIdHelper: { shortId: () => "gen" },
  ArrayHelper: { getAll: (arr: any[], prop: string, val: any) => (arr || []).filter((a) => a[prop] === val) }
}));

import { getDb } from "../../db/index.js";
import { PageRepo } from "../PageRepo.js";
import { LinkRepo } from "../LinkRepo.js";
import { GlobalStyleRepo } from "../GlobalStyleRepo.js";
import { BlockRepo } from "../BlockRepo.js";

function recordingDb(opts: { execute?: any; executeTakeFirst?: any; takeFirstQueue?: any[] } = {}) {
  const calls: { method: string; args: any[] }[] = [];
  const queue = opts.takeFirstQueue ? [...opts.takeFirstQueue] : null;
  const proxy: any = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (prop === "execute") return async () => opts.execute ?? [];
      if (prop === "executeTakeFirst") return async () => (queue ? queue.shift() : (opts.executeTakeFirst ?? null));
      return (...args: any[]) => { calls.push({ method: prop as string, args }); return proxy; };
    }
  });
  return { proxy, calls };
}
const firstArg = (calls: any[], method: string) => calls.find((c) => c.method === method)?.args[0];
const whereCalls = (calls: any[]) => calls.filter((c) => c.method === "where");
const siteWheres = (calls: any[]) => whereCalls(calls).filter((c) => c.args[0] === "siteId");

afterEach(() => jest.restoreAllMocks());

describe("PageRepo siteId", () => {
  it("loadByUrl filters by siteId", async () => {
    const { proxy, calls } = recordingDb({ executeTakeFirst: null });
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new PageRepo().loadByUrl("c1", "/home", "s1");
    expect(siteWheres(calls).some((c) => c.args[2] === "s1")).toBe(true);
  });

  it("create defaults siteId to ''", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new PageRepo().save({ churchId: "c1", url: "/home" });
    expect(firstArg(calls, "values").siteId).toBe("");
  });
});

describe("LinkRepo siteId", () => {
  it("loadByCategory filters by siteId", async () => {
    const { proxy, calls } = recordingDb({ execute: [] });
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new LinkRepo().loadByCategory("c1", "footer", "s1");
    expect(siteWheres(calls).some((c) => c.args[2] === "s1")).toBe(true);
  });

  it("sort scopes its reorder query by siteId", async () => {
    const { proxy, calls } = recordingDb({ execute: [] });
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new LinkRepo().sort("c1", "footer", null as any, "s1");
    expect(siteWheres(calls).some((c) => c.args[2] === "s1")).toBe(true);
  });
});

describe("GlobalStyleRepo siteId fallback", () => {
  it("falls back to the primary row when the site has none", async () => {
    const { proxy, calls } = recordingDb({ takeFirstQueue: [undefined, { id: "g0", siteId: "" }] });
    (getDb as jest.Mock).mockReturnValue(proxy);
    const result = await new GlobalStyleRepo().loadForChurch("c1", "s1");
    expect(result).toEqual({ id: "g0", siteId: "" });
    expect(siteWheres(calls).some((c) => c.args[2] === "s1")).toBe(true); // primary query for the site
    expect(siteWheres(calls).some((c) => c.args[2] === "")).toBe(true);   // fallback query
  });

  it("does not fall back for the primary site", async () => {
    const { proxy, calls } = recordingDb({ takeFirstQueue: [undefined] });
    (getDb as jest.Mock).mockReturnValue(proxy);
    const result = await new GlobalStyleRepo().loadForChurch("c1", "");
    expect(result).toBeNull();
    expect(siteWheres(calls).length).toBe(1); // single query, no fallback
  });
});

describe("BlockRepo siteId", () => {
  it("loadByBlockType with a site uses an IN (['', siteId]) filter", async () => {
    const { proxy, calls } = recordingDb({ execute: [] });
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new BlockRepo().loadByBlockType("c1", "footerBlock", "s1");
    const w = siteWheres(calls)[0];
    expect(w.args[1]).toBe("in");
    expect(w.args[2]).toEqual(["", "s1"]);
  });

  it("loadByBlockType without a site filters siteId = ''", async () => {
    const { proxy, calls } = recordingDb({ execute: [] });
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new BlockRepo().loadByBlockType("c1", "footerBlock");
    const w = siteWheres(calls)[0];
    expect(w.args[1]).toBe("=");
    expect(w.args[2]).toBe("");
  });
});
