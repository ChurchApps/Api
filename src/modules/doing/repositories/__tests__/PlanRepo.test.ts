import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ UniqueIdHelper: { shortId: () => "gen_id" } }));

import { getDb } from "../../db/index.js";
import { PlanRepo } from "../PlanRepo.js";

function recordingDb() {
  const calls: { method: string; args: unknown[] }[] = [];
  const proxy = new Proxy<Record<string, unknown>>({}, {
    get(_t, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (prop === "execute") return async () => [];
      if (prop === "executeTakeFirst") return async () => null;
      return (...args: unknown[]) => { calls.push({ method: prop as string, args }); return proxy; };
    }
  });
  return { proxy, calls };
}

interface JoinRecorder { onRef: (...args: string[]) => JoinRecorder }
type JoinCallback = (join: JoinRecorder) => unknown;
interface WhereRecorder {
  (...args: unknown[]): { cmp: unknown[] };
  or: (items: unknown[]) => { or: unknown[] };
}
type WhereCallback = (eb: WhereRecorder) => unknown;

// Records the join conditions a Kysely join callback builds.
function recordJoin(callback: JoinCallback) {
  const ons: string[][] = [];
  const join: JoinRecorder = { onRef: (...args: string[]) => { ons.push(args); return join; } };
  callback(join);
  return ons;
}

// Evaluates a Kysely where callback into a plain tree of comparisons.
const evalWhere = (callback: WhereCallback) => {
  const eb = ((...args: unknown[]) => ({ cmp: args })) as WhereRecorder;
  eb.or = (items: unknown[]) => ({ or: items });
  return callback(eb);
};

// Issue #1324: plans of a deleted plan type kept showing under volunteer opportunities.
describe("PlanRepo.loadSignupPlans", () => {
  afterEach(() => jest.restoreAllMocks());

  it("left joins planTypes and drops plans whose type no longer exists", async () => {
    const { proxy, calls } = recordingDb();
    (getDb as jest.Mock).mockReturnValue(proxy);
    await new PlanRepo().loadSignupPlans("c1");

    const leftJoin = calls.find((c) => c.method === "leftJoin");
    expect(leftJoin?.args[0]).toBe("planTypes as pt");
    expect(recordJoin(leftJoin?.args[1] as JoinCallback)).toEqual([["pt.id", "=", "p.planTypeId"], ["pt.churchId", "=", "p.churchId"]]);

    const predicates = calls.filter((c) => c.method === "where" && typeof c.args[0] === "function").map((c) => evalWhere(c.args[0] as WhereCallback));
    expect(predicates).toContainEqual({ or: [{ cmp: ["p.planTypeId", "is", null] }, { cmp: ["pt.id", "is not", null] }] });
  });
});
