jest.mock("../../infrastructure/KyselyPool.js", () => ({ KyselyPool: { getDb: jest.fn() } }));
jest.mock("../../infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: jest.fn() } }));

import { KyselyPool } from "../../infrastructure/KyselyPool.js";
import { getContentModuleGateway } from "../ContentModuleGateway.js";

function recordingDb() {
  const calls: { method: string; args: any[] }[] = [];
  const proxy: any = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      // Non-empty id lists so every cascade branch runs.
      if (prop === "execute") return async () => [{ id: "x1" }];
      // The cascade runs inside pool.transaction().execute(cb) — hand cb the same recording proxy.
      if (prop === "transaction") return () => ({ execute: async (cb: any) => cb(proxy) });
      return (...args: any[]) => { calls.push({ method: prop as string, args }); return proxy; };
    }
  });
  return { proxy, calls };
}

describe("ContentModuleGateway.deleteSiteContent", () => {
  afterEach(() => jest.restoreAllMocks());

  it("throws on an empty siteId (never cascades the primary '' sentinel)", async () => {
    await expect(getContentModuleGateway().deleteSiteContent("c1", "")).rejects.toThrow();
  });

  it("cascades deletes across the site-scoped content tables, church-scoped", async () => {
    const { proxy, calls } = recordingDb();
    (KyselyPool.getDb as jest.Mock).mockReturnValue(proxy);
    await getContentModuleGateway().deleteSiteContent("c1", "s1");

    const deletes = calls.filter((c) => c.method === "deleteFrom").map((c) => c.args[0]);
    [
      "elements", "sections", "pageHistory", "posts", "pages", "blocks", "links", "globalStyles"
    ].forEach((t) => {
      expect(deletes).toContain(t);
    });
    // Every query is church-scoped.
    const wheres = calls.filter((c) => c.method === "where");
    expect(wheres.some((c) => c.args[0] === "churchId" && c.args[2] === "c1")).toBe(true);
    // Links + globalStyles are matched on the site directly.
    expect(wheres.some((c) => c.args[0] === "siteId" && c.args[2] === "s1")).toBe(true);
  });
});
