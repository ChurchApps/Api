import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({
  UniqueIdHelper: { shortId: () => "gen_id" },
  DateHelper: { toMysqlDate: (d: Date) => d }
}));

import { getDb } from "../../db/index.js";
import { SongRepo } from "../SongRepo.js";

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

// Issue #1084: /songs/search ran an unbounded 4-table join, so a church with a
// large library waited on (and downloaded) every matching arrangement key.
describe("SongRepo.search", () => {
  afterEach(() => jest.restoreAllMocks());

  it("bounds the result set with a default limit", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new SongRepo().search("c1", "amazing grace");
    const limit = calls.find((c) => c.method === "limit");
    expect(limit).toBeDefined();
    expect(limit?.args[0]).toBeGreaterThan(0);
  });

  it("honors an explicit limit", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new SongRepo().search("c1", "amazing grace", 25);
    expect(calls.find((c) => c.method === "limit")?.args[0]).toBe(25);
  });

  it("orders results so the bounded page is deterministic", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new SongRepo().search("c1", "amazing grace");
    expect(calls.filter((c) => c.method === "orderBy").map((c) => c.args[0])).toEqual(["sd.title", "sd.artist"]);
  });

  it("still scopes the search to the church", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new SongRepo().search("c1", "amazing grace");
    expect(calls.find((c) => c.method === "where" && c.args[0] === "s.churchId")?.args).toEqual(["s.churchId", "=", "c1"]);
  });
});
