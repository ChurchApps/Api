import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "relayid" } }));
jest.mock("../../helpers/index.js", () => ({ DateHelper: { toMysqlDate: (value: Date) => value } }));

import { getDb } from "../../db/index.js";
import { OAuthRelaySessionRepo } from "../OAuthRelaySessionRepo.js";

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

describe("OAuthRelaySessionRepo", () => {
  afterEach(() => jest.restoreAllMocks());

  it("accepts only the TV session-code alphabet", () => {
    expect(OAuthRelaySessionRepo.isSessionCode("ABCD2345")).toBe(true);
    expect(OAuthRelaySessionRepo.isSessionCode("abcd2345")).toBe(false);
    expect(OAuthRelaySessionRepo.isSessionCode("ABCDEFGI")).toBe(false);
    expect(OAuthRelaySessionRepo.isSessionCode("SHORT")).toBe(false);
  });

  it("claims a completed session once and clears the captured auth code", async () => {
    const { proxy, calls } = recordingDb({ executeTakeFirst: { numUpdatedRows: BigInt(1) } });
    (getDb as jest.Mock).mockReturnValue(proxy);
    expect(await new OAuthRelaySessionRepo().claimCompleted("s1")).toBe(true);
    expect(calls.find((c) => c.method === "updateTable")?.args[0]).toBe("oAuthRelaySessions");
    expect(calls.find((c) => c.method === "set")?.args[0]).toEqual({ status: "expired", authCode: null });
    const wheres = calls.filter((c) => c.method === "where");
    expect(wheres.some((c) => c.args[0] === "id" && c.args[2] === "s1")).toBe(true);
    expect(wheres.some((c) => c.args[0] === "status" && c.args[2] === "completed")).toBe(true);
  });

  it("reports a lost claim when no completed row was updated", async () => {
    const { proxy } = recordingDb({ executeTakeFirst: { numUpdatedRows: BigInt(0) } });
    (getDb as jest.Mock).mockReturnValue(proxy);
    expect(await new OAuthRelaySessionRepo().claimCompleted("s1")).toBe(false);
    expect(await new OAuthRelaySessionRepo().claimCompleted("")).toBe(false);
  });
});
