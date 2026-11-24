import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, DateHelper: { toMysqlDate: (d: Date) => d.toISOString().slice(0, 19).replace("T", " ") }, UniqueIdHelper: { shortId: () => "gen_id" } }));

import { CompiledQuery, DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from "kysely";
import type { ContentDatabase } from "../../db/DatabaseTypes.js";
import { EventRepo } from "../EventRepo";

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

const run = async (fn: (repo: EventRepo) => Promise<unknown>) => {
  const { db, queries } = capturingDb();
  getDb.mockReturnValue(db);
  await fn(new EventRepo());
  expect(queries).toHaveLength(1);
  return queries[0];
};

const param = (q: { sql: string; parameters: readonly unknown[] }, column: string) => {
  const columns = q.sql.startsWith("insert")
    ? q.sql.slice(q.sql.indexOf("(") + 1, q.sql.indexOf(")")).split(",").map((c) => c.trim())
    : [...q.sql.matchAll(/`(\w+)` = \?/g)].map((m) => `\`${m[1]}\``);
  const index = columns.indexOf("`" + column + "`");
  expect(index).toBeGreaterThanOrEqual(0);
  return q.parameters[index];
};

describe("EventRepo.save registration payment options", () => {
  it("defaults a new event to self-cancel on and pay later off", async () => {
    const q = await run((r) => r.save({ churchId: "C1", title: "Camp" }));
    expect(param(q, "allowSelfCancel")).toBe(true);
    expect(param(q, "allowPayLater")).toBe(false);
  });

  it("writes both settings on update", async () => {
    const q = await run((r) => r.save({ id: "E1", churchId: "C1", title: "Camp", allowSelfCancel: false, allowPayLater: true }));
    expect(param(q, "allowSelfCancel")).toBe(false);
    expect(param(q, "allowPayLater")).toBe(true);
  });

  it("keeps the stored settings when an update omits them", async () => {
    const q = await run((r) => r.save({ id: "E1", churchId: "C1", title: "Camp" }));
    expect(q.sql).not.toContain("`allowSelfCancel`");
    expect(q.sql).not.toContain("`allowPayLater`");
  });
});
