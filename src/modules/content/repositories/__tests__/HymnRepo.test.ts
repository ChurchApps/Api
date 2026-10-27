import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen_id" } }));

import { getDb } from "../../db/index.js";
import { HymnRepo } from "../HymnRepo.js";

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
const hasWhere = (calls: { method: string; args: any[] }[], column: string, value: any) => whereCalls(calls).some((c) => c.args[0] === column && c.args[1] === "=" && c.args[2] === value);
const hasWhereOn = (calls: { method: string; args: any[] }[], column: string) => whereCalls(calls).some((c) => c.args[0] === column);

describe("HymnRepo public queries", () => {
  afterEach(() => jest.restoreAllMocks());

  it("loadPublicAll returns only the church's published, unarchived hymns", async () => {
    const { proxy, calls } = recordingDb({ execute: [] });
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new HymnRepo().loadPublicAll("c1");
    expect(firstArg(calls, "selectFrom")).toBe("hymns");
    expect(hasWhere(calls, "churchId", "c1")).toBe(true);
    expect(hasWhere(calls, "published", true)).toBe(true);
    expect(hasWhere(calls, "archived", false)).toBe(true);
  });

  it("loadPublic filters by id and still requires published and unarchived", async () => {
    const { proxy, calls } = recordingDb({ executeTakeFirst: null });
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new HymnRepo().loadPublic("c1", "h1");
    expect(firstArg(calls, "selectFrom")).toBe("hymns");
    expect(hasWhere(calls, "id", "h1")).toBe(true);
    expect(hasWhere(calls, "churchId", "c1")).toBe(true);
    expect(hasWhere(calls, "published", true)).toBe(true);
    expect(hasWhere(calls, "archived", false)).toBe(true);
  });
});

describe("HymnRepo private queries and writes", () => {
  afterEach(() => jest.restoreAllMocks());

  it("loadAll filters on churchId only, including drafts and archived hymns", async () => {
    const { proxy, calls } = recordingDb({ execute: [] });
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new HymnRepo().loadAll("c1");
    expect(firstArg(calls, "selectFrom")).toBe("hymns");
    expect(hasWhere(calls, "churchId", "c1")).toBe(true);
    expect(hasWhereOn(calls, "published")).toBe(false);
    expect(hasWhereOn(calls, "archived")).toBe(false);
  });

  it("delete archives the hymn scoped by id and churchId instead of deleting it", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new HymnRepo().delete("c1", "h1");
    expect(firstArg(calls, "updateTable")).toBe("hymns");
    expect(firstArg(calls, "set")).toEqual({ archived: true });
    expect(hasWhere(calls, "id", "h1")).toBe(true);
    expect(hasWhere(calls, "churchId", "c1")).toBe(true);
    expect(calls.some((c) => c.method === "deleteFrom")).toBe(false);
  });

  it("save of a new hymn stores verses as versesJSON", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    const verses = [{ order: 1, text: "Verse one" }, { order: 2, label: "Chorus", text: "Verse two" }];
    await new HymnRepo().save({ churchId: "c1", number: 1, title: "Hymn", language: "English", verses });
    expect(firstArg(calls, "insertInto")).toBe("hymns");
    const values = firstArg(calls, "values");
    expect(values).toMatchObject({ id: "gen_id", churchId: "c1", versesJSON: JSON.stringify(verses) });
    expect(values).not.toHaveProperty("verses");
  });
});
