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
// use idx_messages_churchId_conversationId and walks every message row. They also must not run inside the
// UPDATE, where they take shared locks on messages and deadlock with concurrent message inserts.
describe("ConversationRepo.updateStats", () => {
  const { getDb } = jest.requireMock("../../db/index");
  const statsRow = { firstPostId: "MSG1", lastPostId: "MSG2", postCount: 2 };

  it("reads the stats with one SELECT, then writes them with one UPDATE that does not read messages", async () => {
    const { db, queries } = capturingDb([statsRow]);
    getDb.mockReturnValue(db);
    await new ConversationRepo().updateStats("CVS1");
    expect(queries).toHaveLength(2);
    expect(queries[0].sql).toMatch(/^\s*SELECT/);
    expect(queries[0].sql).not.toMatch(/FOR UPDATE|LOCK IN SHARE MODE/i);
    expect(queries[0].sql).toMatch(/\(SELECT id FROM messages .* ORDER BY timeSent ASC, id ASC LIMIT 1\) AS firstPostId/);
    expect(queries[0].sql).toMatch(/\(SELECT id FROM messages .* ORDER BY timeSent DESC, id DESC LIMIT 1\) AS lastPostId/);
    expect(queries[0].sql).toMatch(/\(SELECT COUNT\(\*\) FROM messages .*\) AS postCount/);
    expect(queries[0].parameters).toEqual(["CVS1"]);
    expect(queries[1].sql).toMatch(/^\s*UPDATE conversations SET firstPostId=\?, lastPostId=\?, postCount=\?\s+WHERE id=\?/);
    expect(queries[1].sql).not.toMatch(/messages/);
    expect(queries[1].parameters).toEqual(["MSG1", "MSG2", 2, "CVS1"]);
  });

  it("scopes every messages subquery to the conversation's church so the composite index is used", async () => {
    const { db, queries } = capturingDb([statsRow]);
    getDb.mockReturnValue(db);
    await new ConversationRepo().updateStats("CVS1");
    const subqueries = queries[0].sql.match(/FROM messages WHERE [^)]*/g) || [];
    expect(subqueries).toHaveLength(3);
    for (const where of subqueries) expect(where).toContain("churchId=c.churchId AND conversationId=c.id");
  });
});

// A Kysely that compiles real MySQL but never connects; every statement it runs is recorded.
// Production: a burst of ~100 POST /messaging/conversations finished one after another, up to 18 s each.
// save() ran the global CALL cleanup() before every insert, and the saves queued behind it.
// Cleanup now runs from the 30-minute timer, so a save is just its own INSERT or UPDATE.
describe("ConversationRepo.save", () => {
  const { getDb } = jest.requireMock("../../db/index");

  it("creates a conversation with one INSERT and no cleanup call", async () => {
    const { db, queries } = capturingDb();
    getDb.mockReturnValue(db);
    const input = { churchId: "C1", contentType: "group", contentId: "G1", title: "Chat", groupId: "G1", visibility: "public", allowAnonymousPosts: false };
    const result = await new ConversationRepo().save({ ...input });
    expect(result).toEqual({ ...input, id: "cvs_generated" });
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toMatch(/^\s*insert into `conversations`/i);
    expect(queries.some((q) => /CALL\s+cleanup/i.test(q.sql))).toBe(false);
  });

  it("updates a conversation with one UPDATE and no cleanup call", async () => {
    const { db, queries } = capturingDb();
    getDb.mockReturnValue(db);
    const input = { id: "CVS1", churchId: "C1", title: "Chat", groupId: "G1", visibility: "hidden", allowAnonymousPosts: true };
    const result = await new ConversationRepo().save({ ...input });
    expect(result).toEqual(input);
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toMatch(/^\s*update `conversations`/i);
    expect(queries[0].parameters).toEqual(["Chat", "G1", "hidden", true, "CVS1", "C1"]);
  });

  it("cleanup() still calls the stored procedure", async () => {
    const { db, queries } = capturingDb();
    getDb.mockReturnValue(db);
    await new ConversationRepo().cleanup();
    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toMatch(/^CALL cleanup\(\)$/);
  });

  it("cleanup() ignores a missing stored procedure", async () => {
    getDb.mockReturnValue({ getExecutor: () => { throw new Error("PROCEDURE cleanup does not exist"); } });
    await expect(new ConversationRepo().cleanup()).resolves.toBeUndefined();
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
