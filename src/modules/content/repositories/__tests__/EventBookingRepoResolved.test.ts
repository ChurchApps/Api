import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, DateHelper: {}, UniqueIdHelper: { shortId: () => "gen_id" } }));

import { DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from "kysely";
import { EventBookingRepo } from "../EventBookingRepo";

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

const run = async (fn: (repo: EventBookingRepo) => Promise<any>) => {
  const { db, queries } = capturingDb();
  getDb.mockReturnValue(db);
  await fn(new EventBookingRepo());
  expect(queries).toHaveLength(1);
  return queries[0].sql.replace(/\s+/g, " ");
};

// #1488: approvals history lists decided room/resource requests, most recently decided first.
describe("EventBookingRepo.loadResolved", () => {
  it("returns approved and rejected bookings with the same joins as pending", async () => {
    const q = await run((r) => r.loadResolved("C1"));
    expect(q).toMatch(/inner join `events` on `events`.`id` = `eventBookings`.`eventId`/);
    expect(q).toMatch(/`rooms`.`approvalGroupId` as `roomApprovalGroupId`/);
    expect(q).toMatch(/where `eventBookings`.`churchId` = \? and `eventBookings`.`status` in \(\?, \?\) order by `eventBookings`.`resolvedDate` desc/);
  });
});
