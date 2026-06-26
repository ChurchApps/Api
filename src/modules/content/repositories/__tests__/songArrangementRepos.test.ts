import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen_id" }, DateHelper: { toMysqlDate: (d: Date) => d } }));

import { getDb } from "../../db/index.js";
import { SongRepo } from "../SongRepo.js";
import { ArrangementRepo } from "../ArrangementRepo.js";
import { SongDetailRepo } from "../SongDetailRepo.js";

// Minimal recording stand-in for the Kysely fluent builder: every chained call is
// captured so a test can assert on the column list / join targets, and the
// terminal execute()/executeTakeFirst() resolve to canned results.
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

describe("SongRepo persists song identity (songDetailId)", () => {
  afterEach(() => jest.restoreAllMocks());

  it("includes songDetailId in the insert on create", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new SongRepo().save({ churchId: "c1", songDetailId: "sd1", name: "Amazing Grace", dateAdded: new Date() });
    expect(firstArg(calls, "insertInto")).toBe("songs");
    expect(firstArg(calls, "values")).toMatchObject({ songDetailId: "sd1", name: "Amazing Grace" });
  });

  it("includes songDetailId in the set on update", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new SongRepo().save({ id: "s1", churchId: "c1", songDetailId: "sd1", name: "Amazing Grace", dateAdded: new Date() });
    expect(firstArg(calls, "updateTable")).toBe("songs");
    expect(firstArg(calls, "set")).toMatchObject({ songDetailId: "sd1" });
  });

  it("search joins songDetails via the song's identity, not an arrangement", async () => {
    const { proxy, calls } = recordingDb({ execute: [] });
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new SongRepo().search("c1", "amazing grace");
    const joins = calls.filter((c) => c.method === "innerJoin");
    expect(joins.some((c) => c.args[0] === "songDetails as sd" && c.args[2] === "s.songDetailId")).toBe(true);
    expect(joins.some((c) => c.args[2] === "a.songDetailId")).toBe(false);
  });
});

describe("ArrangementRepo persists per-arrangement musical fields", () => {
  afterEach(() => jest.restoreAllMocks());

  const musical = { bpm: 120, seconds: 245, meter: "4/4", sequence: "V1 C V2 C B C" };

  it("includes bpm/seconds/meter/sequence in the insert on create", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new ArrangementRepo().save({ churchId: "c1", songId: "s1", name: "Acoustic", lyrics: "", ...musical });
    expect(firstArg(calls, "insertInto")).toBe("arrangements");
    expect(firstArg(calls, "values")).toMatchObject(musical);
  });

  it("includes bpm/seconds/meter/sequence in the set on update", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new ArrangementRepo().save({ id: "a1", churchId: "c1", songId: "s1", name: "Acoustic", lyrics: "", ...musical });
    expect(firstArg(calls, "updateTable")).toBe("arrangements");
    expect(firstArg(calls, "set")).toMatchObject(musical);
  });
});

describe("SongDetailRepo.loadForChurch resolves identity from the song", () => {
  afterEach(() => jest.restoreAllMocks());

  it("joins songDetails on song.songDetailId and no longer through arrangements", async () => {
    const { proxy, calls } = recordingDb({ execute: [] });
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new SongDetailRepo().loadForChurch("c1");
    const joins = calls.filter((c) => c.method === "innerJoin");
    expect(joins.some((c) => c.args[0] === "songDetails as sd" && c.args[2] === "s.songDetailId")).toBe(true);
    expect(joins.some((c) => String(c.args[0]).startsWith("arrangements"))).toBe(false);
  });
});
