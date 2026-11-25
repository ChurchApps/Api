import "reflect-metadata";
jest.mock("@churchapps/apihelper", () => ({
  UniqueIdHelper: { shortId: () => "gen_id" },
  DateHelper: { toMysqlDate: (d: Date) => d }
}));
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));

// The atomic guards run via kysely's tagged `sql` template; mock it to capture the
// query text and return a configurable affected-rows result.
let sqlResult: { numAffectedRows: bigint } = { numAffectedRows: 0n };
const sqlCalls: string[] = [];
jest.mock("kysely", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ..._vals: unknown[]) => ({
      execute: async () => {
        sqlCalls.push(strings.join("?"));
        return sqlResult;
      }
    }),
    { ref: () => ({}) }
  )
}));

import { getDb } from "../../db/index.js";
import { RegistrationRepo } from "../RegistrationRepo.js";
import { RegistrationMemberRepo } from "../RegistrationMemberRepo.js";
import { RegistrationSelectionChoiceRepo } from "../RegistrationSelectionChoiceRepo.js";

function recordingDb(results: { execute?: unknown; executeTakeFirst?: unknown } = {}) {
  const proxy: Record<string, unknown> = new Proxy({}, {
    get(_t, prop) {
      if (typeof prop === "symbol" || prop === "then") return undefined;
      if (prop === "execute") return async () => results.execute ?? [];
      if (prop === "executeTakeFirst") return async () => results.executeTakeFirst ?? null;
      return () => proxy;
    }
  });
  return proxy;
}

beforeEach(() => {
  sqlResult = { numAffectedRows: 0n };
  sqlCalls.length = 0;
});

describe("RegistrationRepo.atomicInsertWithCapacityCheck", () => {
  it("returns false when the guarded INSERT affects 0 rows (event full)", async () => {
    (getDb as jest.Mock).mockReturnValue(recordingDb());
    sqlResult = { numAffectedRows: 0n };
    const ok = await new RegistrationRepo().atomicInsertWithCapacityCheck({ churchId: "c1", eventId: "e1", status: "confirmed" }, 50);
    expect(ok).toBe(false);
    expect(sqlCalls[0]).toContain("status IN ('pending','confirmed')");
  });

  it("returns true when a slot is available", async () => {
    (getDb as jest.Mock).mockReturnValue(recordingDb());
    sqlResult = { numAffectedRows: 1n };
    const ok = await new RegistrationRepo().atomicInsertWithCapacityCheck({ churchId: "c1", eventId: "e1", status: "confirmed" }, 50);
    expect(ok).toBe(true);
  });

  it("skips the guard entirely when capacity is null", async () => {
    (getDb as jest.Mock).mockReturnValue(recordingDb());
    const ok = await new RegistrationRepo().atomicInsertWithCapacityCheck({ churchId: "c1", eventId: "e1", status: "confirmed" }, null);
    expect(ok).toBe(true);
    expect(sqlCalls.length).toBe(0);
  });
});

describe("RegistrationMemberRepo.atomicInsertWithTypeCapacity", () => {
  it("returns false when the per-type guard rejects (type full)", async () => {
    (getDb as jest.Mock).mockReturnValue(recordingDb());
    sqlResult = { numAffectedRows: 0n };
    const ok = await new RegistrationMemberRepo().atomicInsertWithTypeCapacity({ churchId: "c1", registrationId: "r1", registrationTypeId: "t1", firstName: "A", lastName: "B" }, 2);
    expect(ok).toBe(false);
    expect(sqlCalls[0]).toContain("m.registrationTypeId=");
  });

  it("does a plain insert (no guard) when the type has no capacity", async () => {
    (getDb as jest.Mock).mockReturnValue(recordingDb());
    const ok = await new RegistrationMemberRepo().atomicInsertWithTypeCapacity({ churchId: "c1", registrationId: "r1", registrationTypeId: "t1" }, null);
    expect(ok).toBe(true);
    expect(sqlCalls.length).toBe(0);
  });
});

describe("RegistrationSelectionChoiceRepo.atomicInsertWithCapacityCheck", () => {
  it("uses a SUM(quantity) guard and returns false when it would exceed capacity", async () => {
    (getDb as jest.Mock).mockReturnValue(recordingDb());
    sqlResult = { numAffectedRows: 0n };
    const ok = await new RegistrationSelectionChoiceRepo().atomicInsertWithCapacityCheck({ churchId: "c1", registrationId: "r1", selectionId: "s1", quantity: 3 }, 50);
    expect(ok).toBe(false);
    expect(sqlCalls[0]).toContain("SUM(c.quantity)");
  });
});

describe("RegistrationRepo.promoteFromWaitlist", () => {
  it("returns null when there is no waitlisted candidate", async () => {
    (getDb as jest.Mock).mockReturnValue(recordingDb({ executeTakeFirst: null }));
    const promoted = await new RegistrationRepo().promoteFromWaitlist("c1", "e1", 50);
    expect(promoted).toBeNull();
  });

  it("promotes the oldest waitlisted row via a guarded UPDATE when a spot frees", async () => {
    (getDb as jest.Mock).mockReturnValue(recordingDb({ executeTakeFirst: { id: "r9", personId: "p9", status: "waitlisted", totalAmount: 25, amountPaid: 0 } }));
    sqlResult = { numAffectedRows: 1n };
    const promoted = await new RegistrationRepo().promoteFromWaitlist("c1", "e1", 50);
    expect(promoted).toMatchObject({ id: "r9", status: "pending" });
    expect(sqlCalls[0]).toContain("status='waitlisted'");
  });

  it("confirms a free registration straight off the waitlist", async () => {
    (getDb as jest.Mock).mockReturnValue(recordingDb({ executeTakeFirst: { id: "r9", status: "waitlisted", totalAmount: 0, amountPaid: 0 } }));
    sqlResult = { numAffectedRows: 1n };
    const promoted = await new RegistrationRepo().promoteFromWaitlist("c1", "e1", 50);
    expect(promoted).toMatchObject({ id: "r9", status: "confirmed" });
  });

  it("returns null when the guarded UPDATE loses the race (0 rows)", async () => {
    (getDb as jest.Mock).mockReturnValue(recordingDb({ executeTakeFirst: { id: "r9", status: "waitlisted" } }));
    sqlResult = { numAffectedRows: 0n };
    const promoted = await new RegistrationRepo().promoteFromWaitlist("c1", "e1", 50);
    expect(promoted).toBeNull();
  });
});

describe("RegistrationRepo.loadRegisteredPersonIds", () => {
  function whereRecordingDb(rows: { personId: string | null }[]) {
    const wheres: unknown[][] = [];
    const proxy: Record<string, unknown> = new Proxy({}, {
      get(_t, prop) {
        if (typeof prop === "symbol" || prop === "then") return undefined;
        if (prop === "execute") return async () => rows;
        if (prop === "where") return (...args: unknown[]) => { wheres.push(args); return proxy; };
        return () => proxy;
      }
    });
    return { proxy, wheres };
  }

  it("skips the query when there is nobody to check", async () => {
    (getDb as jest.Mock).mockClear();
    expect(await new RegistrationRepo().loadRegisteredPersonIds("c1", "e1", [])).toEqual([]);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("scopes to the church and event, ignores cancelled registrations, and dedupes", async () => {
    const { proxy, wheres } = whereRecordingDb([{ personId: "p1" }, { personId: "p1" }, { personId: null }]);
    (getDb as jest.Mock).mockReturnValue(proxy);
    const ids = await new RegistrationRepo().loadRegisteredPersonIds("c1", "e1", ["p1", "p2"], "r1");
    expect(ids).toEqual(["p1"]);
    expect(wheres).toEqual(expect.arrayContaining([
      ["churchId", "=", "c1"],
      ["eventId", "=", "e1"],
      ["status", "<>", "cancelled"],
      ["personId", "in", ["p1", "p2"]],
      ["id", "<>", "r1"],
      ["r.churchId", "=", "c1"],
      ["r.eventId", "=", "e1"],
      ["r.status", "<>", "cancelled"],
      ["m.personId", "in", ["p1", "p2"]],
      ["r.id", "<>", "r1"]
    ]));
  });
});
