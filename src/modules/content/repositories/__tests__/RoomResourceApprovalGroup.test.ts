import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "gen_id" } }));

import { CompiledQuery, DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from "kysely";
import type { ContentDatabase } from "../../db/DatabaseTypes.js";
import { RoomRepo } from "../RoomRepo";
import { ResourceRepo } from "../ResourceRepo";

const { getDb } = jest.requireMock("../../db/index");

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
  const db = new Kysely<ContentDatabase>({
    dialect: {
      createAdapter: () => new MysqlAdapter(),
      createDriver: () => driver,
      createIntrospector: (k) => new MysqlIntrospector(k),
      createQueryCompiler: () => new MysqlQueryCompiler()
    }
  });
  return { db, queries };
}

// #1508: choosing "No approval needed" on an existing room or resource must clear its approval group.
describe.each([
  ["RoomRepo", () => new RoomRepo()],
  ["ResourceRepo", () => new ResourceRepo()]
])("%s.save clearing the approval group", (_name, makeRepo) => {
  it.each([["undefined", undefined], ["null", null]])("writes approvalGroupId = NULL when it is %s", async (_label, value) => {
    const { db, queries } = capturingDb();
    getDb.mockReturnValue(db);
    await makeRepo().save({ id: "item1", churchId: "church1", name: "Main Hall", approvalGroupId: value });
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain("`approvalGroupId` = ?");
    const cols = queries[0].sql.match(/`(\w+)` = \?/g).map((c) => c.replace(/[`= ?]/g, ""));
    expect(queries[0].parameters[cols.indexOf("approvalGroupId")]).toBeNull();
  });
});
