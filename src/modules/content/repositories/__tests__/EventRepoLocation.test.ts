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

const locationParam = (q: { sql: string; parameters: readonly unknown[] }) => {
  const columns = q.sql.startsWith("insert")
    ? q.sql.slice(q.sql.indexOf("(") + 1, q.sql.indexOf(")")).split(",").map((c) => c.trim())
    : [...q.sql.matchAll(/`(\w+)` = \?/g)].map((m) => `\`${m[1]}\``);
  const index = columns.indexOf("`location`");
  expect(index).toBeGreaterThanOrEqual(0);
  return q.parameters[index];
};

describe("EventRepo.save location", () => {
  it("writes the location on insert", async () => {
    const q = await run((r) => r.save({ churchId: "C1", title: "Picnic", location: "City Park, shelter 3" }));
    expect(q.sql).toMatch(/^insert into `events`/);
    expect(locationParam(q)).toBe("City Park, shelter 3");
  });

  it("writes the location on update", async () => {
    const q = await run((r) => r.save({ id: "E1", churchId: "C1", title: "Picnic", location: "Fellowship Hall" }));
    expect(q.sql).toMatch(/^update `events`/);
    expect(locationParam(q)).toBe("Fellowship Hall");
  });

  it("clears a blanked location to null", async () => {
    const q = await run((r) => r.save({ id: "E1", churchId: "C1", title: "Picnic", location: "" }));
    expect(locationParam(q)).toBeNull();
  });

  it("leaves the stored location alone when an update omits it", async () => {
    const q = await run((r) => r.save({ id: "E1", churchId: "C1", title: "Picnic" }));
    expect(q.sql).toMatch(/^update `events`/);
    expect(q.sql).not.toContain("`location`");
  });
});
