import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, DateHelper: {}, UniqueIdHelper: { shortId: () => "gen_id" } }));

import { DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from "kysely";
import { EventRepo } from "../EventRepo";

const { getDb } = jest.requireMock("../../db/index");

function capturingDb() {
  const queries: { sql: string; parameters: readonly unknown[] }[] = [];
  const driver = new DummyDriver();
  driver.acquireConnection = async () => ({
    executeQuery: async (q: any) => {
      queries.push({ sql: q.sql, parameters: q.parameters });
      return { rows: [] } as any;
    },
    streamQuery: async function* () {}
  });
  const db = new Kysely<any>({
    dialect: {
      createAdapter: () => new MysqlAdapter(),
      createDriver: () => driver,
      createIntrospector: (k) => new MysqlIntrospector(k),
      createQueryCompiler: () => new MysqlQueryCompiler()
    }
  });
  return { db, queries };
}

const run = async (fn: (repo: EventRepo) => Promise<any>) => {
  const { db, queries } = capturingDb();
  getDb.mockReturnValue(db);
  await fn(new EventRepo());
  expect(queries).toHaveLength(1);
  return queries[0].sql.replace(/\s+/g, " ");
};

// The gate must be ANDed before the OR'd branches so curated calendars and eventIds can't bypass it.
describe("EventRepo timeline visibility", () => {
  it("guest with no groups only gets public events, even via curated calendars or eventIds", async () => {
    const q = await run((r) => r.loadTimeline("C1", [], ["E1"]));
    expect(q).toMatch(/where churchId=\? AND visibility='public' AND \(\(/);
  });

  it("members also get private events from their own groups", async () => {
    const q = await run((r) => r.loadTimeline("C1", ["G1", "G2"], []));
    expect(q).toMatch(/where churchId=\? AND \(visibility='public' OR groupId IN \(\?,\?\)\) AND \(\(/);
  });

  it("group timeline doesn't expose a group's private events to non-members", async () => {
    const q = await run((r) => r.loadTimelineGroup("C1", "CONF", [], ["E1"]));
    expect(q).toMatch(/where churchId=\? AND visibility='public' AND \(\(/);
  });
});
