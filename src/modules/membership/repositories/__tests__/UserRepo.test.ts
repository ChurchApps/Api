jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "usr_gen" } }));
jest.mock("../../helpers/index.js", () => ({
  __esModule: true,
  DateHelper: { toMysqlDate: (d: unknown) => d ?? null }
}));

import { getDb } from "../../db/index.js";
import { UserRepo } from "../UserRepo.js";
import { AuthGuidHelper } from "../../helpers/AuthGuidHelper.js";

type Eb = ((col: string, op: string, val: string) => string) & { or: (arr: string[]) => string[] };

function recordingDb(results: unknown[] = []) {
  const calls: { method: string; args: unknown[] }[] = [];
  const proxy: Record<string, unknown> = new Proxy<Record<string, unknown>>({}, {
    get(_t, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (prop === "execute") return async () => results;
      if (prop === "executeTakeFirst") return async () => results[0] ?? null;
      return (...args: unknown[]) => { calls.push({ method: prop as string, args }); return proxy; };
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
    const ebCalls: { col: string; op: string; val: string }[] = [];
    const eb: Eb = Object.assign(
      (col: string, op: string, val: string) => { ebCalls.push({ col, op, val }); return `${col}${op}${val}`; },
      { or: (arr: string[]) => arr }
    );
    (where.args[0] as (eb: Eb) => unknown)(eb);
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

describe("UserRepo.consumeVerification", () => {
  it("clears the code only while the stored hash still matches", async () => {
    const { proxy, calls } = recordingDb([{ numUpdatedRows: BigInt(1) }]);
    (getDb as jest.Mock).mockReturnValue(proxy);
    expect(await new UserRepo().consumeVerification("u1", "login:hash")).toBe(true);
    expect(calls.find((c) => c.method === "set")?.args).toEqual([{ verificationCode: null, verificationExpires: null, verificationAttempts: 0 }]);
    expect(calls.filter((c) => c.method === "where").map((c) => c.args)).toEqual([
      ["id", "=", "u1"],
      ["verificationCode", "=", "login:hash"]
    ]);
  });

  it("reports failure when another request already used the code", async () => {
    const { proxy } = recordingDb([{ numUpdatedRows: BigInt(0) }]);
    (getDb as jest.Mock).mockReturnValue(proxy);
    expect(await new UserRepo().consumeVerification("u1", "login:hash")).toBe(false);
  });

  it("does not issue an unguarded update", async () => {
    const { proxy, calls } = recordingDb([]);
    (getDb as jest.Mock).mockReturnValue(proxy);
    expect(await new UserRepo().consumeVerification("u1", "")).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
