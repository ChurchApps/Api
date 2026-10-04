import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
// apihelper ships untransformed ESM; stub the only symbol MessageRepo uses.
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "msg_generated" } }));

import { DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from "kysely";
import { MessageRepo } from "../MessageRepo";

const { getDb } = jest.requireMock("../../db/index");

describe("MessageRepo.loadForConversationsPaginated", () => {
  it("loads the page for every conversation in a single query", async () => {
    const { db, queries } = capturingDb();
    getDb.mockReturnValue(db);
    await new MessageRepo().loadForConversationsPaginated("C1", ["CV1", "CV2", "CV3"], 2, 20);
    expect(queries).toHaveLength(1);
    const parts = queries[0].sql.split(" UNION ALL ");
    expect(parts).toHaveLength(3);
    for (const part of parts) {
      expect(part).toBe("(SELECT * FROM messages WHERE churchId=? AND conversationId=? ORDER BY timeSent DESC LIMIT ? OFFSET ?)");
    }
    expect(queries[0].parameters).toEqual([
      "C1", "CV1", 20, 20, "C1", "CV2", 20, 20, "C1", "CV3", 20, 20
    ]);
  });

  it("runs no query when there are no conversations", async () => {
    const { db, queries } = capturingDb();
    getDb.mockReturnValue(db);
    const result = await new MessageRepo().loadForConversationsPaginated("C1", []);
    expect(queries).toHaveLength(0);
    expect(result.size).toBe(0);
  });

  it("groups rows by conversation, newest first, keeping database order for equal times", async () => {
    const t = (m: number) => new Date(Date.UTC(2026, 9, 1, 12, m));
    const rows = [
      { id: "a2", conversationId: "CV1", timeSent: t(2) },
      { id: "b1", conversationId: "CV2", timeSent: t(5) },
      { id: "a1", conversationId: "CV1", timeSent: t(1) },
      { id: "a3", conversationId: "CV1", timeSent: t(3) },
      { id: "b2", conversationId: "CV2", timeSent: t(5) }
    ];
    const { db } = capturingDb(rows);
    getDb.mockReturnValue(db);
    const result = await new MessageRepo().loadForConversationsPaginated("C1", ["CV1", "CV2", "CV3"]);
    expect(result.get("CV1")!.map((r) => r.id)).toEqual(["a3", "a2", "a1"]);
    expect(result.get("CV2")!.map((r) => r.id)).toEqual(["b1", "b2"]);
    expect(result.has("CV3")).toBe(false);
  });
});

// A Kysely that compiles real MySQL but never connects; every statement it runs is recorded.
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
