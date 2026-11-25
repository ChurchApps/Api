import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "dl_generated" } }));

import { CompiledQuery, DatabaseConnection, DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler, QueryResult } from "kysely";
import type { MessagingDatabase } from "../../db/DatabaseTypes.js";
import { DeliveryLogRepo } from "../DeliveryLogRepo.js";

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

describe("DeliveryLogRepo.loadFailuresByPerson", () => {
  it("selects only failed rows for one person in the church, newest first, limited, without message content", async () => {
    const { db, queries } = capturingDb([]);
    getDb.mockReturnValue(db);
    await new DeliveryLogRepo().loadFailuresByPerson("c1", "p1", 25);
    expect(queries).toHaveLength(1);
    const { sql, parameters } = queries[0];
    expect(sql).toBe("select `attemptTime`, `deliveryMethod`, `deliveryAddress`, `errorMessage` from `deliveryLogs` where `churchId` = ? and `personId` = ? and `success` = ? order by `attemptTime` desc limit ?");
    expect(parameters).toEqual(["c1", "p1", false, 25]);
  });
});

function contentTypes(parameters: readonly unknown[]): string[] {
  return parameters.filter((p): p is string => p === "email" || p === "formFollowUp" || p === "invite" || p === "workflowEmail");
}

function capturingDb(rows: Record<string, unknown>[] = []) {
  const queries: { sql: string; parameters: readonly unknown[] }[] = [];
  const driver = new DummyDriver();
  driver.acquireConnection = async (): Promise<DatabaseConnection> => ({
    executeQuery: async <R>(q: CompiledQuery): Promise<QueryResult<R>> => {
      queries.push({ sql: q.sql, parameters: q.parameters });
      return { rows: rows as R[] };
    },
    streamQuery: async function* () {}
  });
  const db = new Kysely<MessagingDatabase>({
    dialect: {
      createAdapter: () => new MysqlAdapter(),
      createDriver: () => driver,
      createIntrospector: (k) => new MysqlIntrospector(k),
      createQueryCompiler: () => new MysqlQueryCompiler()
    }
  });
  return { db, queries };
}
