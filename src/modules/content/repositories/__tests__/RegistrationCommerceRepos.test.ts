import "reflect-metadata";
jest.mock("@churchapps/apihelper", () => ({
  UniqueIdHelper: { shortId: () => "gen_id" },
  DateHelper: { toMysqlDate: (d: any) => d }
}));
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));

// The atomic guards run via kysely's tagged `sql` template; mock it to capture the
// query text and return a configurable affected-rows result.
let sqlResult: any = { numAffectedRows: 0n };
const sqlCalls: string[] = [];
jest.mock("kysely", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ..._vals: any[]) => ({
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

function recordingDb(results: { execute?: any; executeTakeFirst?: any } = {}) {
  const proxy: any = new Proxy({}, {
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
    const ok = await new RegistrationRepo().atomicInsertWithCapacityCheck({ churchId: "c1", eventId: "e1", status: "confirmed" } as any, 50);
    expect(ok).toBe(false);
    expect(sqlCalls[0]).toContain("status IN ('pending','confirmed')");
  });

  it("returns true when a slot is available", async () => {
    (getDb as jest.Mock).mockReturnValue(recordingDb());
    sqlResult = { numAffectedRows: 1n };
    const ok = await new RegistrationRepo().atomicInsertWithCapacityCheck({ churchId: "c1", eventId: "e1", status: "confirmed" } as any, 50);
    expect(ok).toBe(true);
  });

  it("skips the guard entirely when capacity is null", async () => {
    (getDb as jest.Mock).mockReturnValue(recordingDb());
    const ok = await new RegistrationRepo().atomicInsertWithCapacityCheck({ churchId: "c1", eventId: "e1", status: "confirmed" } as any, null);
    expect(ok).toBe(true);
    expect(sqlCalls.length).toBe(0);
  });
});

describe("RegistrationMemberRepo.atomicInsertWithTypeCapacity", () => {
  it("returns false when the per-type guard rejects (type full)", async () => {
    (getDb as jest.Mock).mockReturnValue(recordingDb());
    sqlResult = { numAffectedRows: 0n };
    const ok = await new RegistrationMemberRepo().atomicInsertWithTypeCapacity({ churchId: "c1", registrationId: "r1", registrationTypeId: "t1", firstName: "A", lastName: "B" } as any, 2);
    expect(ok).toBe(false);
    expect(sqlCalls[0]).toContain("m.registrationTypeId=");
  });

  it("does a plain insert (no guard) when the type has no capacity", async () => {
    (getDb as jest.Mock).mockReturnValue(recordingDb());
    const ok = await new RegistrationMemberRepo().atomicInsertWithTypeCapacity({ churchId: "c1", registrationId: "r1", registrationTypeId: "t1" } as any, null);
    expect(ok).toBe(true);
    expect(sqlCalls.length).toBe(0);
  });
});

describe("RegistrationSelectionChoiceRepo.atomicInsertWithCapacityCheck", () => {
  it("uses a SUM(quantity) guard and returns false when it would exceed capacity", async () => {
    (getDb as jest.Mock).mockReturnValue(recordingDb());
    sqlResult = { numAffectedRows: 0n };
    const ok = await new RegistrationSelectionChoiceRepo().atomicInsertWithCapacityCheck({ churchId: "c1", registrationId: "r1", selectionId: "s1", quantity: 3 } as any, 50);
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
    (getDb as jest.Mock).mockReturnValue(recordingDb({ executeTakeFirst: { id: "r9", personId: "p9", status: "waitlisted" } }));
    sqlResult = { numAffectedRows: 1n };
    const promoted = await new RegistrationRepo().promoteFromWaitlist("c1", "e1", 50);
    expect(promoted).toMatchObject({ id: "r9", status: "pending" });
    expect(sqlCalls[0]).toContain("status='waitlisted'");
  });

  it("returns null when the guarded UPDATE loses the race (0 rows)", async () => {
    (getDb as jest.Mock).mockReturnValue(recordingDb({ executeTakeFirst: { id: "r9", status: "waitlisted" } }));
    sqlResult = { numAffectedRows: 0n };
    const promoted = await new RegistrationRepo().promoteFromWaitlist("c1", "e1", 50);
    expect(promoted).toBeNull();
  });
});
