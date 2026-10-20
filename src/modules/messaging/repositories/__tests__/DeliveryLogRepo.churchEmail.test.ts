import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "dl_generated" } }));

import { DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from "kysely";
import { DeliveryLogRepo } from "../DeliveryLogRepo";

const { getDb } = jest.requireMock("../../db/index");

// Invite rows must not count toward the template allowance or grow it.
const COUNTED = ["email", "formFollowUp", "workflowEmail"];

describe("DeliveryLogRepo church-authored counts", () => {
  it("counts template, form follow-up, and workflow email, and leaves invites out", async () => {
    const { db, queries } = capturingDb([{ cnt: 0 }]);
    getDb.mockReturnValue(db);
    await new DeliveryLogRepo().countChurchEmailsSince("c1", new Date("2026-10-19T00:00:00Z"));
    expect(queries).toHaveLength(1);
    // The first "email" is deliveryMethod; the rest are the counted content types.
    expect(contentTypes(queries[0].parameters)).toEqual(["email", ...COUNTED]);
  });

  it("leaves invites out of the best-day allowance too", async () => {
    const { db, queries } = capturingDb([{ best: 0 }]);
    getDb.mockReturnValue(db);
    await new DeliveryLogRepo().bestChurchEmailDay("c1", new Date("2026-09-19T00:00:00Z"), new Date("2026-10-19T00:00:00Z"));
    expect(queries).toHaveLength(1);
    expect(contentTypes(queries[0].parameters)).toEqual(COUNTED);
  });
});

function contentTypes(parameters: readonly unknown[]): string[] {
  return parameters.filter((p): p is string => p === "email" || p === "formFollowUp" || p === "invite" || p === "workflowEmail");
}

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
