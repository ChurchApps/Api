import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "gen" }, DateHelper: { toMysqlDate: (d: Date) => d.toISOString() } }));

import { getDb } from "../../db/index";
import { FundDonationRepo } from "../FundDonationRepo";

function recordingDb(executeTakeFirst: any) {
  const calls: { method: string; args: any[] }[] = [];
  const proxy: any = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (prop === "executeTakeFirst") return async () => executeTakeFirst;
      if (prop === "fn") return { sum: (c: any) => ({ as: () => ({ col: c }) }), count: (c: any) => ({ distinct: () => ({ as: () => ({ col: c }) }) }) };
      return (...args: any[]) => { calls.push({ method: prop as string, args }); return proxy; };
    }
  });
  return { proxy, calls };
}

const mockedGetDb = getDb as jest.Mock;

describe("FundDonationRepo.getTotalByFundId", () => {
  afterEach(() => jest.restoreAllMocks());

  it("joins donations, scopes by church + fund, and returns numeric totals", async () => {
    const { proxy, calls } = recordingDb({ totalAmount: "150.50", donationCount: "3" });
    mockedGetDb.mockReturnValue(proxy);

    const result = await new FundDonationRepo().getTotalByFundId("C1", "F1");

    expect(result).toEqual({ totalAmount: 150.5, donationCount: 3 });
    expect(calls.find((c) => c.method === "selectFrom")?.args[0]).toBe("fundDonations as fd");
    expect(calls.find((c) => c.method === "innerJoin")?.args[0]).toBe("donations as d");
    const wheres = calls.filter((c) => c.method === "where");
    expect(wheres.some((c) => c.args[0] === "fd.churchId" && c.args[2] === "C1")).toBe(true);
    expect(wheres.some((c) => c.args[0] === "fd.fundId" && c.args[2] === "F1")).toBe(true);
    expect(wheres.some((c) => c.args[0] === "d.donationDate")).toBe(false);
  });

  it("adds date-range predicates when start/end supplied", async () => {
    const { proxy, calls } = recordingDb({ totalAmount: 10, donationCount: 1 });
    mockedGetDb.mockReturnValue(proxy);

    const start = new Date("2026-01-01");
    const end = new Date("2026-12-31");
    await new FundDonationRepo().getTotalByFundId("C1", "F1", start, end);

    const wheres = calls.filter((c) => c.method === "where");
    expect(wheres.some((c) => c.args[0] === "d.donationDate" && c.args[1] === ">=" && c.args[2] === start)).toBe(true);
    expect(wheres.some((c) => c.args[0] === "d.donationDate" && c.args[1] === "<=" && c.args[2] === end)).toBe(true);
  });

  it("returns zeros when no rows match", async () => {
    const { proxy } = recordingDb({ totalAmount: null, donationCount: 0 });
    mockedGetDb.mockReturnValue(proxy);

    const result = await new FundDonationRepo().getTotalByFundId("C1", "missing");
    expect(result).toEqual({ totalAmount: 0, donationCount: 0 });
  });
});
