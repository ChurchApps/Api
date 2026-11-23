import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "gen_id" } }));

import { DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from "kysely";
import { ResourceRepo } from "../ResourceRepo";

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

// #1659: clearing the quantity box on an existing resource must save it as empty, not keep the old number.
describe("ResourceRepo.save clearing the quantity", () => {
  it.each([["undefined", undefined], ["null", null]])("writes quantity = NULL when it is %s", async (_label, value) => {
    const { db, queries } = capturingDb();
    getDb.mockReturnValue(db);
    await new ResourceRepo().save({ id: "res1", churchId: "church1", name: "Projector", quantity: value } as any);
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain("`quantity` = ?");
    const cols = queries[0].sql.match(/`(\w+)` = \?/g).map((c) => c.replace(/[`= ?]/g, ""));
    expect(queries[0].parameters[cols.indexOf("quantity")]).toBeNull();
  });
});
