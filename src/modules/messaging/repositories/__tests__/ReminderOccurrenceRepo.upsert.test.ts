import "reflect-metadata";
import { DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from "kysely";

// A second writer inserts the row after this one's SELECT: the database refuses a plain INSERT on ux_occ.
const executed: string[] = [];
class RacingDriver extends DummyDriver {
  async acquireConnection() {
    return {
      executeQuery: async (query: { sql: string }) => {
        executed.push(query.sql);
        if (/^insert/i.test(query.sql) && !/on duplicate key update/i.test(query.sql)) throw Object.assign(new Error("Duplicate entry for key 'reminderOccurrences.ux_occ'"), { code: "ER_DUP_ENTRY" });
        return { rows: [] };
      },

      streamQuery: async function* () { throw new Error("not used"); }
    } as any;
  }
}
const mockDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new MysqlAdapter(),
    createDriver: () => new RacingDriver(),
    createIntrospector: (db) => new MysqlIntrospector(db),
    createQueryCompiler: () => new MysqlQueryCompiler()
  }
});

jest.mock("../../db/index", () => ({ getDb: () => mockDb }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "gen" } }));
jest.mock("../../../../shared/helpers/DateHelper.js", () => ({ DateHelper: { toMysqlDate: () => "2030-01-01 09:00:00" } }));

import { ReminderOccurrenceRepo } from "../ReminderOccurrenceRepo";

// Production: 4 "Duplicate entry ... for key 'reminderOccurrences.ux_occ'" from InternalEventBus handlers when the same
// reminder definition was expanded concurrently. upsert is documented idempotent on occurrenceKey, so losing the race is fine.
describe("ReminderOccurrenceRepo.upsert", () => {
  it("does not fail when another writer inserts the same occurrenceKey first", async () => {
    await expect(new ReminderOccurrenceRepo().upsert({
      churchId: "c1",
      definitionId: "d1",
      entityType: "event",
      entityId: "e1",
      category: "c",
      message: "m",
      occurrenceKey: "d1:e1:2030-01-01T00:00:00:2880",
      occLocalISO: "2030-01-01T00:00:00",
      fireAt: new Date("2030-01-01T09:00:00Z")
    } as any)).resolves.toBeUndefined();
    expect(executed.some((q) => /^insert/i.test(q))).toBe(true);
  });
});
