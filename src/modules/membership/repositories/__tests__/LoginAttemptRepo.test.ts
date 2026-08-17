import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "la_gen" } }));

import { Kysely, MysqlDialect } from "kysely";
import { getDb } from "../../db/index.js";
import { LoginAttemptRepo } from "../LoginAttemptRepo.js";

function recordingDb(opts: { executeTakeFirst?: any } = {}) {
  const calls: { method: string; args: any[] }[] = [];
  const proxy: any = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (prop === "execute") return async () => [];
      if (prop === "executeTakeFirst") return async () => opts.executeTakeFirst ?? null;
      return (...args: any[]) => { calls.push({ method: prop as string, args }); return proxy; };
    }
  });
  return { proxy, calls };
}
const whereCalls = (calls: any[]) => calls.filter((c) => c.method === "where");

describe("LoginAttemptRepo.loadCount", () => {
  afterEach(() => jest.restoreAllMocks());

  it("reads the counter for the key, ignoring rows older than the window", async () => {
    const { proxy, calls } = recordingDb({ executeTakeFirst: { attemptCount: 7 } });
    (getDb as jest.Mock).mockReturnValue(proxy);
    expect(await new LoginAttemptRepo().loadCount("account|a@b.c", 900)).toBe(7);
    expect(calls.find((c) => c.method === "selectFrom")?.args[0]).toBe("loginAttempts");
    const wheres = whereCalls(calls);
    expect(wheres.some((c) => c.args[0] === "attemptKey" && c.args[2] === "account|a@b.c")).toBe(true);
    expect(wheres.some((c) => c.args[0] === "windowStart" && c.args[1] === ">")).toBe(true);
  });

  it("treats a missing row as zero attempts", async () => {
    const { proxy } = recordingDb({ executeTakeFirst: null });
    (getDb as jest.Mock).mockReturnValue(proxy);
    expect(await new LoginAttemptRepo().loadCount("ip|1.1.1.1", 900)).toBe(0);
  });
});

// The counter has to survive concurrent Lambda containers, so the increment must be a single
// atomic upsert rather than a read-modify-write. Compile it and check the statement itself.
describe("LoginAttemptRepo.increment", () => {
  afterEach(() => jest.restoreAllMocks());

  it("issues one upsert that rolls the window over when the row has expired", async () => {
    // Real MySQL compiler, no connection: capture the statement instead of running it.
    const mysql = new Kysely<any>({ dialect: new MysqlDialect({ pool: {} as any }) });
    const executor = mysql.getExecutor();
    let compiled: any = null;
    jest.spyOn(executor as any, "executeQuery").mockImplementation(async (query: any) => { compiled = query; return { rows: [] }; });
    (getDb as jest.Mock).mockReturnValue({ getExecutor: () => executor });

    await new LoginAttemptRepo().increment("account|a@b.c", 900);

    const sqlText = compiled.sql.replace(/\s+/g, " ");
    expect(sqlText).toContain("INSERT INTO loginAttempts (id, attemptKey, attemptCount, windowStart) VALUES (?, ?, 1, NOW())");
    expect(sqlText).toContain("ON DUPLICATE KEY UPDATE");
    expect(sqlText).toContain("attemptCount = IF(windowStart < DATE_SUB(NOW(), INTERVAL ? SECOND), 1, attemptCount + 1)");
    expect(sqlText).toContain("windowStart = IF(windowStart < DATE_SUB(NOW(), INTERVAL ? SECOND), NOW(), windowStart)");
    expect(compiled.parameters).toEqual(["la_gen", "account|a@b.c", 900, 900]);
  });
});

describe("LoginAttemptRepo cleanup", () => {
  afterEach(() => jest.restoreAllMocks());

  it("clears the given keys", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new LoginAttemptRepo().clear(["account|a@b.c", "ip|1.1.1.1"]);
    expect(calls.find((c) => c.method === "deleteFrom")?.args[0]).toBe("loginAttempts");
    expect(whereCalls(calls)[0].args[2]).toEqual(["account|a@b.c", "ip|1.1.1.1"]);
  });

  it("does not issue a query for an empty key list", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new LoginAttemptRepo().clear([]);
    expect(calls).toEqual([]);
  });

  it("deleteOld drops rows past the retention cutoff", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new LoginAttemptRepo().deleteOld(1);
    expect(calls.find((c) => c.method === "deleteFrom")?.args[0]).toBe("loginAttempts");
    expect(whereCalls(calls)[0].args[0]).toBe("windowStart");
    expect(whereCalls(calls)[0].args[1]).toBe("<");
  });
});
