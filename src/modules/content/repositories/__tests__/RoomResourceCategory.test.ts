import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, DateHelper: {}, UniqueIdHelper: { shortId: () => "gen_id" } }));

import { DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from "kysely";
import { RoomRepo } from "../RoomRepo";
import { ResourceRepo } from "../ResourceRepo";

const { getDb } = jest.requireMock("../../db/index");

function capturingDb(rows: any[] = []) {
  const queries: { sql: string; parameters: readonly unknown[] }[] = [];
  const driver = new DummyDriver();
  driver.acquireConnection = async () => ({
    executeQuery: async (q: any) => {
      queries.push({ sql: q.sql, parameters: q.parameters });
      return { rows } as any;
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
  getDb.mockReturnValue(db);
  return queries;
}

// #1650: rooms and resources carry an optional category that groups them in the booking pickers.
describe.each([
  ["rooms", () => new RoomRepo()],
  ["resources", () => new ResourceRepo()]
])("%s category", (table, makeRepo) => {
  it("writes the category on create, trimmed", async () => {
    const queries = capturingDb();
    await makeRepo().save({ churchId: "C1", name: "Chapel", categoryName: "  Main Building " } as any);
    expect(queries[0].sql).toMatch(new RegExp("insert into `" + table + "` \\(.*`categoryName`"));
    expect(queries[0].parameters).toContain("Main Building");
  });

  it("writes the category on update", async () => {
    const queries = capturingDb();
    await makeRepo().save({ id: "R1", churchId: "C1", name: "Chapel", categoryName: "AV" } as any);
    expect(queries[0].sql).toMatch(new RegExp("update `" + table + "` set .*`categoryName` = \\?"));
    expect(queries[0].parameters).toContain("AV");
  });

  it("stores a blank category as null so the item stays uncategorized", async () => {
    const queries = capturingDb();
    await makeRepo().save({ id: "R1", churchId: "C1", name: "Chapel", categoryName: "  " } as any);
    expect(queries[0].sql).toMatch(/`categoryName` = \?/);
    const idx = (queries[0].sql.match(/`(\w+)` = \?/g) || []).findIndex((s) => s.includes("categoryName"));
    expect(queries[0].parameters[idx]).toBeNull();
  });
});
