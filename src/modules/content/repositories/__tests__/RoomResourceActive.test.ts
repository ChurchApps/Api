import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, DateHelper: {}, UniqueIdHelper: { shortId: () => "gen_id" } }));

import { CompiledQuery, DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler, QueryResult } from "kysely";
import type { ContentDatabase } from "../../db/DatabaseTypes.js";
import { RoomRepo } from "../RoomRepo";
import { ResourceRepo } from "../ResourceRepo";

const { getDb } = jest.requireMock("../../db/index");

function capturingDb(rows: unknown[] = []) {
  const queries: { sql: string; parameters: readonly unknown[] }[] = [];
  const driver = new DummyDriver();
  driver.acquireConnection = async () => ({
    executeQuery: async <R>(q: CompiledQuery): Promise<QueryResult<R>> => {
      queries.push({ sql: q.sql, parameters: q.parameters });
      return { rows: rows as R[] };
    },
    streamQuery: async function* () {}
  });
  const db = new Kysely<ContentDatabase>({
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

// #1593: rooms and resources carry an Active/Inactive flag so a retired item leaves the booking pickers but keeps its history.
describe.each([
  ["rooms", () => new RoomRepo()],
  ["resources", () => new ResourceRepo()]
])("%s active flag", (table, makeRepo) => {
  it("defaults a new item to active", async () => {
    const queries = capturingDb();
    await makeRepo().save({ churchId: "C1", name: "Chapel" });
    expect(queries[0].sql).toMatch(new RegExp("insert into `" + table + "` \\(.*`active`"));
    expect(queries[0].parameters).toContain(true);
  });

  it("saves an item switched to inactive", async () => {
    const queries = capturingDb();
    await makeRepo().save({ id: "R1", churchId: "C1", name: "Chapel", active: false });
    expect(queries[0].sql).toMatch(new RegExp("update `" + table + "` set .*`active` = \\?"));
    expect(queries[0].parameters).toContain(false);
  });

  it("returns active as a boolean so inactive items can be filtered", async () => {
    capturingDb([{ id: "R1", name: "Chapel", active: 0 }, { id: "R2", name: "Gym", active: 1 }]);
    const list = await makeRepo().loadAll("C1");
    expect(list.map((r) => r.active)).toEqual([false, true]);
  });
});
