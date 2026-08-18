import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen_id" } }));

import { getDb } from "../../db/index.js";
import { FileRepo } from "../FileRepo.js";

function recordingDb() {
  const calls: { method: string; args: any[] }[] = [];
  const proxy: any = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (prop === "execute" || prop === "executeTakeFirst") return async () => [];
      return (...args: any[]) => { calls.push({ method: prop as string, args }); return proxy; };
    }
  });
  return { proxy, calls };
}

describe("FileRepo.deleteForContent", () => {
  afterEach(() => jest.restoreAllMocks());

  it("deletes files scoped to church, contentType, and contentId", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new FileRepo().deleteForContent("c1", "arrangement", "a1");
    expect(calls.find((c) => c.method === "deleteFrom")?.args[0]).toBe("files");
    const church = calls.find((c) => c.method === "where" && c.args[0] === "churchId");
    const type = calls.find((c) => c.method === "where" && c.args[0] === "contentType");
    const id = calls.find((c) => c.method === "where" && c.args[0] === "contentId");
    expect(church?.args).toEqual(["churchId", "=", "c1"]);
    expect(type?.args).toEqual(["contentType", "=", "arrangement"]);
    expect(id?.args).toEqual(["contentId", "=", "a1"]);
  });
});
