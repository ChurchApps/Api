import "reflect-metadata";
jest.mock("../../db/index", () => ({ getDb: jest.fn() }));
// apihelper ships untransformed ESM; stub the only symbol ConversationRepo uses.
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "cvs_generated" } }));

import { DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from "kysely";
import { ConversationRepo } from "../ConversationRepo";

// Regression: rowToModel dropped allowAnonymousPosts, so undefined check always rejected anon posts despite db=true.
describe("ConversationRepo.convertToModel", () => {
  const repo = new ConversationRepo();

  it("preserves allowAnonymousPosts=true from the db row", () => {
    const model = repo.convertToModel({ id: "CVS1", churchId: "C1", allowAnonymousPosts: true });
    expect(model.allowAnonymousPosts).toBe(true);
  });

  it("preserves allowAnonymousPosts=false from the db row", () => {
    const model = repo.convertToModel({ id: "CVS1", churchId: "C1", allowAnonymousPosts: false });
    expect(model.allowAnonymousPosts).toBe(false);
  });

  it("coerces a truthy non-boolean (e.g. 1 from a BIT/TINYINT column) to boolean true", () => {
    const model = repo.convertToModel({ id: "CVS1", churchId: "C1", allowAnonymousPosts: 1 });
    expect(model.allowAnonymousPosts).toBe(true);
  });

  it("carries through the other persisted fields the model exposes", () => {
    const model = repo.convertToModel({
      id: "CVS1",
      churchId: "C1",
      contentType: "streamingLive",
      contentId: "STR1",
      title: "Chat",
      groupId: "GRP1",
      visibility: "public",
      firstPostId: "MSG1",
      lastPostId: "MSG2",
      postCount: 3,
      allowAnonymousPosts: true
    });
    expect(model).toMatchObject({
      groupId: "GRP1",
      visibility: "public",
      firstPostId: "MSG1",
      lastPostId: "MSG2",
      postCount: 3
    });
  });
});

// updateStats runs on every message post. Its subqueries must filter on churchId too, or MySQL cannot
// use idx_messages_churchId_conversationId and walks every message row under the conversation row lock.
describe("ConversationRepo.updateStats", () => {
  const { getDb } = jest.requireMock("../../db/index");

  it("runs one UPDATE for the conversation", async () => {
    const { db, queries } = capturingDb();
    getDb.mockReturnValue(db);
    await new ConversationRepo().updateStats("CVS1");
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toMatch(/^\s*UPDATE conversations c SET/);
    expect(queries[0].sql).toMatch(/c\.firstPostId = \(SELECT id FROM messages .* ORDER BY timeSent ASC, id ASC LIMIT 1\)/);
    expect(queries[0].sql).toMatch(/c\.lastPostId = \(SELECT id FROM messages .* ORDER BY timeSent DESC, id DESC LIMIT 1\)/);
    expect(queries[0].sql).toMatch(/c\.postCount = \(SELECT COUNT\(\*\) FROM messages /);
    expect(queries[0].parameters).toEqual(["CVS1"]);
  });

  it("scopes every messages subquery to the conversation's church so the composite index is used", async () => {
    const { db, queries } = capturingDb();
    getDb.mockReturnValue(db);
    await new ConversationRepo().updateStats("CVS1");
    const subqueries = queries[0].sql.match(/FROM messages WHERE [^)]*/g) || [];
    expect(subqueries).toHaveLength(3);
    for (const where of subqueries) expect(where).toContain("churchId=c.churchId AND conversationId=c.id");
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
