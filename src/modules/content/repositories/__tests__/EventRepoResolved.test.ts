import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, DateHelper: { toMysqlDate: (d: Date) => d.toISOString().slice(0, 19).replace("T", " ") }, UniqueIdHelper: { shortId: () => "gen_id" } }));

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

// #1488: approvals history lists decided requests, never pending ones.
describe("EventRepo.loadResolved", () => {
  it("returns approved and rejected event requests, newest first", async () => {
    const q = await run((r) => r.loadResolved("C1"));
    expect(q).toMatch(/where `churchId` = \? and `approvalStatus` in \(\?, \?\) order by `start` desc/);
  });
});

// #1508: the decider and decision time are written on save, and left alone when absent.
describe("EventRepo.save resolvedBy / resolvedDate", () => {
  it("writes both columns when the decision is set", async () => {
    const q = await run((r) => r.save({ id: "E1", churchId: "C1", resolvedBy: "P1", resolvedDate: new Date("2026-11-11T15:00:00Z") } as any));
    expect(q).toMatch(/^update `events` set .*`resolvedBy` = \?.*`resolvedDate` = \?/);
  });

  it("does not touch either column on a plain edit", async () => {
    const q = await run((r) => r.save({ id: "E1", churchId: "C1", title: "Picnic" } as any));
    expect(q).not.toMatch(/resolvedBy|resolvedDate/);
  });
});
