import "reflect-metadata";
jest.mock("../../db/index.js", () => ({ getDb: jest.fn() }));
jest.mock("../../helpers/index.js", () => ({ DateHelper: { toMysqlDate: (d: any) => d } }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "gen" } }));

import { DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from "kysely";
import { FormSubmissionRepo } from "../FormSubmissionRepo.js";
import { getDb } from "../../db/index.js";

// Issue #1356: an admin's "Change person" sets contentType/contentId but keeps submittedBy, so My Forms must match both.
describe("FormSubmissionRepo.loadForSubmitter", () => {
  it("also returns submissions an admin assigned to the person", async () => {
    const { db, queries } = capturingDb();
    (getDb as jest.Mock).mockReturnValue(db);

    await new FormSubmissionRepo().loadForSubmitter("ch1", "PER1");

    const { sql, parameters } = queries[0];
    expect(sql).toMatch(/`fs`\.`submittedBy` = \? or \(`fs`\.`contentType` = \? and `fs`\.`contentId` = \?\)/);
    expect(parameters).toEqual(expect.arrayContaining(["ch1", "PER1", "person", "form"]));
    expect(parameters.filter((p) => p === "PER1")).toHaveLength(2);
    expect(sql).toMatch(/`f`\.`contentType` = \?/);
  });
});

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
  return { db, queries };
}
