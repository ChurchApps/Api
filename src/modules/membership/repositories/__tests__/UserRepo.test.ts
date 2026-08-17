jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "usr_gen" } }));
jest.mock("../../helpers/index.js", () => ({
  __esModule: true,
  DateHelper: { toMysqlDate: (d: any) => d ?? null }
}));

import { getDb } from "../../db/index.js";
import { UserRepo } from "../UserRepo.js";
import { AuthGuidHelper } from "../../helpers/AuthGuidHelper.js";

function recordingDb(results: any[] = []) {
  const calls: { method: string; args: any[] }[] = [];
  const proxy: any = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (prop === "execute") return async () => results;
      if (prop === "executeTakeFirst") return async () => results[0] ?? null;
      return (...args: any[]) => { calls.push({ method: prop as string, args }); return proxy; };
    }
  });
  return { proxy, calls };
}

describe("UserRepo.loadByAuthGuid", () => {
  it("matches legacy plaintext or the hashed prefix", async () => {
    const { proxy, calls } = recordingDb([]);
    (getDb as jest.Mock).mockReturnValue(proxy);
    const raw = "11111111-1111-4111-8111-111111111111";
    await new UserRepo().loadByAuthGuid(raw);
    const where = calls.find((c) => c.method === "where");
    expect(where).toBeTruthy();
    const ebCalls: any[] = [];
    const eb: any = (col: string, op: string, val: string) => { ebCalls.push({ col, op, val }); return `${col}${op}${val}`; };
    eb.or = (arr: any[]) => arr;
    where.args[0](eb);
    expect(ebCalls).toEqual([
      { col: "authGuid", op: "=", val: raw },
      { col: "authGuid", op: "like", val: AuthGuidHelper.hash(raw) + ":%" }
    ]);
  });

  it("returns null for an empty guid", async () => {
    const { proxy } = recordingDb([]);
    (getDb as jest.Mock).mockReturnValue(proxy);
    expect(await new UserRepo().loadByAuthGuid("")).toBeNull();
  });
});

describe("UserRepo.consumeAuthGuid", () => {
  it("swaps the guid only while the stored value still matches", async () => {
    const { proxy, calls } = recordingDb([{ numUpdatedRows: BigInt(1) }]);
    (getDb as jest.Mock).mockReturnValue(proxy);
    expect(await new UserRepo().consumeAuthGuid("u1", "old", "old:1")).toBe(true);
    expect(calls.find((c) => c.method === "updateTable")?.args).toEqual(["users"]);
    expect(calls.find((c) => c.method === "set")?.args).toEqual([{ authGuid: "old:1" }]);
    expect(calls.filter((c) => c.method === "where").map((c) => c.args)).toEqual([
      ["id", "=", "u1"],
      ["authGuid", "=", "old"]
    ]);
  });

  it("reports failure when the race was already lost", async () => {
    const { proxy } = recordingDb([{ numUpdatedRows: BigInt(0) }]);
    (getDb as jest.Mock).mockReturnValue(proxy);
    expect(await new UserRepo().consumeAuthGuid("u1", "old", "old:1")).toBe(false);
  });

  it("does not issue a no-op or unguarded update", async () => {
    const { proxy, calls } = recordingDb([{ numUpdatedRows: BigInt(1) }]);
    (getDb as jest.Mock).mockReturnValue(proxy);
    expect(await new UserRepo().consumeAuthGuid("u1", "same", "same")).toBe(false);
    expect(await new UserRepo().consumeAuthGuid("u1", "", "new")).toBe(false);
    expect(await new UserRepo().consumeAuthGuid("", "old", "new")).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
