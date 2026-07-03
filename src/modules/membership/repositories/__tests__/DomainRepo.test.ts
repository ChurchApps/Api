import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "dom_gen" } }));

import { getDb } from "../../db/index.js";
import { DomainRepo } from "../DomainRepo.js";

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

describe("DomainRepo siteId persistence", () => {
  afterEach(() => jest.restoreAllMocks());

  it("create defaults siteId to '' when absent", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new DomainRepo().save({ churchId: "c1", domainName: "x.com" });
    expect(firstArg(calls, "values").siteId).toBe("");
  });

  it("update writes the provided siteId", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new DomainRepo().save({ id: "d1", churchId: "c1", domainName: "x.com", siteId: "s1" });
    expect(firstArg(calls, "set").siteId).toBe("s1");
  });

  it("clearSiteId sets siteId='' scoped by churchId + siteId", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new DomainRepo().clearSiteId("c1", "s1");
    expect(firstArg(calls, "updateTable")).toBe("domains");
    expect(firstArg(calls, "set")).toEqual({ siteId: "" });
    const wheres = whereCalls(calls);
    expect(wheres.some((c) => c.args[0] === "churchId" && c.args[2] === "c1")).toBe(true);
    expect(wheres.some((c) => c.args[0] === "siteId" && c.args[2] === "s1")).toBe(true);
  });
});

describe("DomainRepo.loadPairs", () => {
  afterEach(() => jest.restoreAllMocks());

  it("joins sites and dials via COALESCE(NULLIF(s.subDomain, ...))", async () => {
    const { proxy, calls } = recordingDb({ execute: [] });
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new DomainRepo().loadPairs();
    expect(calls.some((c) => c.method === "leftJoin" && c.args[0] === "sites as s")).toBe(true);
    const selectCall = calls.find((c) => c.method === "select");
    const serialized = (selectCall!.args[0] as any[])
      .filter((a) => a && typeof a === "object" && typeof a.toOperationNode === "function")
      .map((a) => JSON.stringify(a.toOperationNode()))
      .join(" ");
    expect(serialized).toContain("COALESCE");
  });

  it("excludes www.* and empty domainName rows", async () => {
    const { proxy, calls } = recordingDb({ execute: [] });
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new DomainRepo().loadPairs();
    const wheres = calls.filter((c) => c.method === "where");
    expect(wheres.some((c) => c.args[0] === "d.domainName" && c.args[1] === "not like" && c.args[2] === "%www.%")).toBe(true);
    expect(wheres.some((c) => c.args[0] === "d.domainName" && c.args[1] === "<>" && c.args[2] === "")).toBe(true);
  });
});

describe("DomainRepo.loadByName", () => {
  afterEach(() => jest.restoreAllMocks());

  it("lowercases the input and returns an exact hit, joining sites", async () => {
    const { proxy, calls } = recordingDb({ takeFirstQueue: [{ id: "d1", domainName: "x.com" }] });
    (getDb as jest.Mock).mockReturnValue(proxy);
    const row = await new DomainRepo().loadByName("X.com");
    expect(row).toEqual({ id: "d1", domainName: "x.com" });
    expect(calls.some((c) => c.method === "leftJoin" && c.args[0] === "sites as s")).toBe(true);
    expect(whereCalls(calls).some((c) => c.args[0] === "d.domainName" && c.args[2] === "x.com")).toBe(true);
  });

  it("retries once with the bare domain when a www.* lookup misses", async () => {
    const { proxy, calls } = recordingDb({ takeFirstQueue: [undefined, { id: "d1", domainName: "x.com" }] });
    (getDb as jest.Mock).mockReturnValue(proxy);
    const row = await new DomainRepo().loadByName("www.X.com");
    expect(row).toEqual({ id: "d1", domainName: "x.com" });
    const domWheres = whereCalls(calls).filter((c) => c.args[0] === "d.domainName");
    expect(domWheres.some((c) => c.args[2] === "www.x.com")).toBe(true);
    expect(domWheres.some((c) => c.args[2] === "x.com")).toBe(true);
  });

  it("returns null when both the exact and bare lookups miss", async () => {
    const { proxy } = recordingDb({ takeFirstQueue: [undefined, undefined] });
    (getDb as jest.Mock).mockReturnValue(proxy);
    expect(await new DomainRepo().loadByName("www.gone.com")).toBeNull();
  });
});
