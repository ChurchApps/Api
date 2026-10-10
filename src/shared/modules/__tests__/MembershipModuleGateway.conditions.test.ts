import { DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from "kysely";

const getDbMock = jest.fn();
jest.mock("../../infrastructure/KyselyPool.js", () => ({ KyselyPool: { getDb: (...args: unknown[]) => getDbMock(...args) } }));
jest.mock("../../infrastructure/RepoManager.js", () => ({ RepoManager: { getRepos: jest.fn() } }));
jest.mock("../../webhooks/WebhookDispatcher.js", () => ({ WebhookDispatcher: {} }));
jest.mock("../../../modules/membership/helpers/GdprErasureHelper.js", () => ({ GdprErasureHelper: {} }));

import { getMembershipModuleGateway } from "../MembershipModuleGateway.js";

function capturingDb() {
  const queries: { sql: string; parameters: readonly unknown[] }[] = [];
  const driver = new DummyDriver();
  driver.acquireConnection = async () => ({
    executeQuery: async (q: any) => {
      queries.push({ sql: q.sql, parameters: q.parameters });
      return { rows: [{ id: "p1" }] } as any;
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

describe("MembershipModuleGateway.loadIdsMatchingCondition text operators", () => {
  const run = async (operator: string, value: string) => {
    const { db, queries } = capturingDb();
    getDbMock.mockReturnValue(db);
    const ids = await getMembershipModuleGateway().loadIdsMatchingCondition({ churchId: "c1", field: "email", operator, value });
    return { ids, sql: queries[0].sql, params: queries[0].parameters };
  };

  it("contains becomes LIKE %value%", async () => {
    const { ids, sql, params } = await run("contains", "@");
    expect(ids).toEqual(["p1"]);
    expect(sql).toContain("email LIKE ?");
    expect(params).toContain("%@%");
  });

  it("startsWith becomes LIKE value%", async () => {
    const { sql, params } = await run("startsWith", "don");
    expect(sql).toContain("email LIKE ?");
    expect(params).toContain("don%");
  });

  it("endsWith becomes LIKE %value", async () => {
    const { sql, params } = await run("endsWith", ".org");
    expect(sql).toContain("email LIKE ?");
    expect(params).toContain("%.org");
  });

  it("escapes LIKE wildcards in the value", async () => {
    const { params } = await run("contains", "50%_off");
    expect(params).toContain("%50\\%\\_off%");
  });

  it("still rejects unknown operators", async () => {
    await expect(run("; DROP", "x")).rejects.toThrow("Invalid condition operator");
  });
});
