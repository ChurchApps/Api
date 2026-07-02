import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen_id" } }));

import { getDb } from "../../db/index.js";
import { RedirectRepo } from "../RedirectRepo.js";

function recordingDb(results: { execute?: any; executeTakeFirst?: any } = {}) {
  const calls: { method: string; args: any[] }[] = [];
  const proxy: any = new Proxy(
    {},
    {
      get(_t, prop) {
        if (typeof prop === "symbol" || prop === "then") return undefined;
        if (prop === "execute") return async () => results.execute ?? [];
        if (prop === "executeTakeFirst") return async () => results.executeTakeFirst ?? null;
        return (...args: any[]) => {
          calls.push({ method: prop as string, args });
          return proxy;
        };
      }
    }
  );
  return { proxy, calls };
}

const firstArg = (calls: { method: string; args: any[] }[], method: string) => calls.find((c) => c.method === method)?.args[0];
const whereCalls = (calls: { method: string; args: any[] }[]) => calls.filter((c) => c.method === "where");

describe("RedirectRepo.normalizePath", () => {
  it("adds a leading slash and lowercases", () => {
    expect(RedirectRepo.normalizePath("About-Us")).toBe("/about-us");
  });
  it("keeps an existing leading slash", () => {
    expect(RedirectRepo.normalizePath("/Foo/Bar")).toBe("/foo/bar");
  });
  it("trims whitespace", () => {
    expect(RedirectRepo.normalizePath("  /Foo  ")).toBe("/foo");
  });
  it("strips a trailing slash but preserves root", () => {
    expect(RedirectRepo.normalizePath("/foo/")).toBe("/foo");
    expect(RedirectRepo.normalizePath("/")).toBe("/");
  });
  it("passes through empty values", () => {
    expect(RedirectRepo.normalizePath("")).toBe("");
  });
});

describe("RedirectRepo persistence", () => {
  afterEach(() => jest.restoreAllMocks());

  const redirect = { churchId: "c1", fromPath: "/old", toPath: "/new" };

  it("inserts into redirects with a generated id and createdDate on create", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new RedirectRepo().save({ ...redirect });
    expect(firstArg(calls, "insertInto")).toBe("redirects");
    const values = firstArg(calls, "values");
    expect(values).toMatchObject({ id: "gen_id", fromPath: "/old", toPath: "/new" });
    expect(values.createdDate).toBeInstanceOf(Date);
  });

  it("updates redirects scoped by id + churchId, without changing churchId", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new RedirectRepo().save({ id: "x1", ...redirect });
    expect(firstArg(calls, "updateTable")).toBe("redirects");
    expect(firstArg(calls, "set")).toMatchObject({ fromPath: "/old", toPath: "/new" });
    expect(firstArg(calls, "set")).not.toHaveProperty("churchId");
    const wheres = whereCalls(calls);
    expect(wheres.some((c) => c.args[0] === "id")).toBe(true);
    expect(wheres.some((c) => c.args[0] === "churchId")).toBe(true);
  });

  it("delete is scoped by id and churchId", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new RedirectRepo().delete("c1", "x1");
    expect(firstArg(calls, "deleteFrom")).toBe("redirects");
    const wheres = whereCalls(calls);
    expect(wheres.some((c) => c.args[0] === "id" && c.args[2] === "x1")).toBe(true);
    expect(wheres.some((c) => c.args[0] === "churchId" && c.args[2] === "c1")).toBe(true);
  });

  it("loadByFromPath filters by church and fromPath", async () => {
    const { proxy, calls } = recordingDb({ execute: [] });
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new RedirectRepo().loadByFromPath("c1", "/old");
    const wheres = whereCalls(calls);
    expect(wheres.some((c) => c.args[0] === "churchId" && c.args[2] === "c1")).toBe(true);
    expect(wheres.some((c) => c.args[0] === "fromPath" && c.args[2] === "/old")).toBe(true);
  });

  it("count returns a number scoped by church", async () => {
    const { proxy, calls } = recordingDb({ executeTakeFirst: { count: 7 } });
    (getDb as jest.Mock).mockReturnValue(proxy);
    const n = await new RedirectRepo().count("c1");
    expect(n).toBe(7);
    expect(whereCalls(calls).some((c) => c.args[0] === "churchId" && c.args[2] === "c1")).toBe(true);
  });
});
