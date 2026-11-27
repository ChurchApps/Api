import "reflect-metadata";
jest.mock("../../db/index.js", () => ({ getDb: jest.fn(), withDoingConnection: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, DateHelper: {}, UniqueIdHelper: { shortId: () => "gen_id" } }));

import { CompiledQuery, DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from "kysely";
import type { DoingDatabase } from "../../db/DatabaseTypes.js";
import { TaskRepo } from "../TaskRepo.js";

const { getDb } = jest.requireMock("../../db/index.js");

function capturingDb() {
  const queries: { sql: string; parameters: readonly unknown[] }[] = [];
  const driver = new DummyDriver();
  driver.acquireConnection = async () => ({
    executeQuery: async (q: CompiledQuery) => {
      queries.push({ sql: q.sql, parameters: q.parameters });
      return { rows: [] };
    },
    streamQuery: async function* () {}
  });
  const db = new Kysely<DoingDatabase>({
    dialect: {
      createAdapter: () => new MysqlAdapter(),
      createDriver: () => driver,
      createIntrospector: (k) => new MysqlIntrospector(k),
      createQueryCompiler: () => new MysqlQueryCompiler()
    }
  });
  return { db, queries };
}

const run = async (groupIds?: string[]) => {
  const { db, queries } = capturingDb();
  getDb.mockReturnValue(db);
  await new TaskRepo().loadForPerson("C1", "P1", "Open", groupIds);
  expect(queries).toHaveLength(1);
  return { sql: queries[0].sql.replace(/\s+/g, " "), parameters: queries[0].parameters };
};

// #1708: My Tasks in the app also lists tasks assigned to one of the member's groups.
describe("TaskRepo.loadForPerson", () => {
  it("includes tasks assigned to the caller's groups", async () => {
    const q = await run(["G1", "G2"]);
    expect(q.sql).toContain("(`assignedToType` = ? and `assignedToId` in (?, ?))");
    expect(q.parameters).toEqual(expect.arrayContaining(["group", "G1", "G2"]));
  });

  it("keeps the person-only query when the caller has no groups", async () => {
    const q = await run([]);
    expect(q.sql).not.toContain("in (");
    expect(q.parameters).not.toContain("group");
  });
});
