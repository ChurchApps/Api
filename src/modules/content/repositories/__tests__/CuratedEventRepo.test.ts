import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen_id" } }));

import { getDb } from "../../db/index.js";
import { CuratedEventRepo } from "../CuratedEventRepo.js";

function recordingDb() {
  const calls: { method: string; args: any[] }[] = [];
  const proxy: any = new Proxy(
    {},
    {
      get(_t, prop) {
        if (typeof prop === "symbol" || prop === "then") return undefined;
        if (prop === "execute") return async () => [];
        return (...args: any[]) => {
          calls.push({ method: prop as string, args });
          return proxy;
        };
      }
    }
  );
  return { proxy, calls };
}

const filtersPublic = (calls: { method: string; args: any[] }[]) =>
  calls.some((c) => c.method === "where" && c.args[0] === "e.visibility" && c.args[2] === "public");

describe("CuratedEventRepo.loadForEvents (#1211)", () => {
  it("only returns public events by default (public calendar, ICS feed)", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new CuratedEventRepo().loadForEvents("CAL1", "c1");
    expect(filtersPublic(calls)).toBe(true);
  });

  it("includes private events when asked (admin curated calendar)", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new CuratedEventRepo().loadForEvents("CAL1", "c1", true);
    expect(filtersPublic(calls)).toBe(false);
  });
});
