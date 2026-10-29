jest.mock("../../db/index", () => ({ getDb: jest.fn() }));

import { getDb } from "../../db/index.js";
import { UserMfaRepo } from "../UserMfaRepo.js";

function dbReturning(executeTakeFirst: () => Promise<unknown>) {
  const proxy: any = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (prop === "executeTakeFirst") return executeTakeFirst;
      return () => proxy;
    }
  });
  return proxy;
}

describe("UserMfaRepo.isEnabled", () => {
  afterEach(() => jest.restoreAllMocks());

  it("is true only when the row is enabled", async () => {
    (getDb as jest.Mock).mockReturnValue(dbReturning(async () => ({ enabled: 1 })));
    expect(await new UserMfaRepo().isEnabled("u1")).toBe(true);
    (getDb as jest.Mock).mockReturnValue(dbReturning(async () => ({ enabled: 0 })));
    expect(await new UserMfaRepo().isEnabled("u1")).toBe(false);
    (getDb as jest.Mock).mockReturnValue(dbReturning(async () => null));
    expect(await new UserMfaRepo().isEnabled("u1")).toBe(false);
  });

  it("treats a missing userMfa table as two-factor off", async () => {
    (getDb as jest.Mock).mockReturnValue(dbReturning(async () => { throw Object.assign(new Error("Table 'membership.userMfa' doesn't exist"), { errno: 1146, code: "ER_NO_SUCH_TABLE" }); }));
    expect(await new UserMfaRepo().isEnabled("u1")).toBe(false);

    (getDb as jest.Mock).mockReturnValue(dbReturning(async () => { throw new Error("Table 'membership.userMfa' doesn't exist"); }));
    expect(await new UserMfaRepo().isEnabled("u1")).toBe(false);

    const wrapped = new Error("query failed");
    (wrapped as any).cause = { code: "ER_NO_SUCH_TABLE", errno: 1146 };
    (getDb as jest.Mock).mockReturnValue(dbReturning(async () => { throw wrapped; }));
    expect(await new UserMfaRepo().isEnabled("u1")).toBe(false);
  });

  it("still throws any other database error", async () => {
    (getDb as jest.Mock).mockReturnValue(dbReturning(async () => { throw Object.assign(new Error("connection lost"), { errno: 2013 }); }));
    await expect(new UserMfaRepo().isEnabled("u1")).rejects.toThrow("connection lost");
  });
});
