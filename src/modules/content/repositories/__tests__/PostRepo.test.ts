import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen_id" } }));

import { getDb } from "../../db/index.js";
import { PostRepo } from "../PostRepo.js";

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

describe("PostRepo persistence", () => {
  afterEach(() => jest.restoreAllMocks());

  const post = { churchId: "c1", title: "Hello", slug: "hello", excerpt: "hi", content: "Hello **world**", category: "News", tags: "a,b", publishDate: new Date() };

  it("inserts into posts with a generated id on create", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new PostRepo().save({ ...post });
    expect(firstArg(calls, "insertInto")).toBe("posts");
    expect(firstArg(calls, "values")).toMatchObject({ id: "gen_id", content: "Hello **world**", slug: "hello", category: "News", tags: "a,b" });
  });

  it("updates posts scoped by id + churchId, without changing churchId", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new PostRepo().save({ id: "x1", ...post });
    expect(firstArg(calls, "updateTable")).toBe("posts");
    expect(firstArg(calls, "set")).toMatchObject({ slug: "hello", title: "Hello" });
    expect(firstArg(calls, "set")).not.toHaveProperty("churchId");
    const wheres = whereCalls(calls);
    expect(wheres.some((c) => c.args[0] === "id")).toBe(true);
    expect(wheres.some((c) => c.args[0] === "churchId")).toBe(true);
  });

  it("delete is scoped by id and churchId", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new PostRepo().delete("c1", "x1");
    expect(firstArg(calls, "deleteFrom")).toBe("posts");
    const wheres = whereCalls(calls);
    expect(wheres.some((c) => c.args[0] === "id" && c.args[2] === "x1")).toBe(true);
    expect(wheres.some((c) => c.args[0] === "churchId" && c.args[2] === "c1")).toBe(true);
  });
});

describe("PostRepo published queries", () => {
  afterEach(() => jest.restoreAllMocks());

  it("loadPublished filters to church, published-and-past, newest first", async () => {
    const { proxy, calls } = recordingDb({ execute: [] });
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new PostRepo().loadPublished("c1");
    const wheres = whereCalls(calls);
    expect(wheres.some((c) => c.args[0] === "churchId" && c.args[2] === "c1")).toBe(true);
    expect(wheres.some((c) => c.args[0] === "publishDate" && c.args[1] === "is not" && c.args[2] === null)).toBe(true);
    expect(wheres.some((c) => c.args[0] === "publishDate" && c.args[1] === "<=")).toBe(true);
    expect(firstArg(calls, "orderBy")).toBe("publishDate");
    const order = calls.find((c) => c.method === "orderBy");
    expect(order?.args[1]).toBe("desc");
  });

  it("loadPublished applies category, tag, pagination when provided", async () => {
    const { proxy, calls } = recordingDb({ execute: [] });
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new PostRepo().loadPublished("c1", { category: "News", tag: "worship", limit: 10, offset: 20 });
    const wheres = whereCalls(calls);
    expect(wheres.some((c) => c.args[0] === "category" && c.args[2] === "News")).toBe(true);
    expect(wheres.some((c) => c.args[0] === "tags" && c.args[1] === "like" && c.args[2] === "%worship%")).toBe(true);
    expect(firstArg(calls, "limit")).toBe(10);
    expect(firstArg(calls, "offset")).toBe(20);
  });

  it("loadPublishedBySlug requires a published, past slug", async () => {
    const { proxy, calls } = recordingDb({ executeTakeFirst: null });
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new PostRepo().loadPublishedBySlug("c1", "hello");
    const wheres = whereCalls(calls);
    expect(wheres.some((c) => c.args[0] === "slug" && c.args[2] === "hello")).toBe(true);
    expect(wheres.some((c) => c.args[0] === "publishDate" && c.args[1] === "is not")).toBe(true);
  });
});
