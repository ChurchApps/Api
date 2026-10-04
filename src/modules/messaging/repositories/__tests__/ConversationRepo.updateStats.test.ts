import "reflect-metadata";
import fs from "fs";
import path from "path";
import { Kysely, MysqlDialect, sql } from "kysely";
import { createPool } from "mysql2";

// Production log: POST /messaging/messages hit ER_LOCK_DEADLOCK on the message insert even with retries.
// updateStats ran an UPDATE whose subqueries scanned messages, taking shared next-key locks that
// block a concurrent insert into the same table. Stats must be read without locking messages.

// The real messaging database, without pulling in Environment/apihelper (ESM-only in Jest).
const db = buildDb();
const other = buildDb();
let current: any = db;

jest.mock("../../db/index", () => ({ getDb: () => current }));
jest.mock("@churchapps/apihelper", () => ({ __esModule: true, UniqueIdHelper: { shortId: () => "gen" } }));

import { ConversationRepo } from "../ConversationRepo";

const CHURCH_ID = "tstconvst";
const CONV_ID = "tstconvstc1";

describe("ConversationRepo.updateStats", () => {
  beforeAll(async () => {
    await cleanup();
    await db.insertInto("conversations" as never).values({ id: CONV_ID, churchId: CHURCH_ID, contentType: "test", contentId: "x", postCount: 0 } as never).execute();
    await db.insertInto("messages" as never).values([
      { id: "tstconvstm1", churchId: CHURCH_ID, conversationId: CONV_ID, messageType: "comment", content: "a", timeSent: "2026-10-01 10:00:00" },
      { id: "tstconvstm2", churchId: CHURCH_ID, conversationId: CONV_ID, messageType: "comment", content: "b", timeSent: "2026-10-01 10:05:00" }
    ] as never).execute();
  });

  afterAll(async () => {
    await cleanup();
    await db.destroy();
    await other.destroy();
  });

  it("sets first, last and count", async () => {
    current = db;
    await new ConversationRepo().updateStats(CONV_ID);
    const row: any = await db.selectFrom("conversations" as never).selectAll().where("id" as never, "=", CONV_ID as never).executeTakeFirst();
    expect(row.firstPostId).toBe("tstconvstm1");
    expect(row.lastPostId).toBe("tstconvstm2");
    expect(Number(row.postCount)).toBe(2);
  });

  it("does not lock messages against a concurrent insert", async () => {
    let insertError: any = null;
    await db.transaction().execute(async (trx) => {
      current = trx;
      await new ConversationRepo().updateStats(CONV_ID);
      // While updateStats' transaction is still open, another connection posts to the same conversation.
      await other.connection().execute(async (conn) => {
        await sql`SET SESSION innodb_lock_wait_timeout = 1`.execute(conn);
        try {
          await conn.insertInto("messages" as never).values({ id: "tstconvstm3", churchId: CHURCH_ID, conversationId: CONV_ID, messageType: "comment", content: "c", timeSent: "2026-10-01 10:10:00" } as never).execute();
        } catch (e: any) {
          insertError = e.code || e.message;
        }
      });
    });
    current = db;
    expect(insertError).toBeNull();
  });
});

async function cleanup() {
  await sql`DELETE FROM messages WHERE churchId = ${CHURCH_ID}`.execute(db);
  await sql`DELETE FROM conversations WHERE churchId = ${CHURCH_ID}`.execute(db);
}

function buildDb(): Kysely<never> {
  const url = new URL(connectionString());
  return new Kysely<never>({
    dialect: new MysqlDialect({
      pool: createPool({
        host: url.hostname,
        port: url.port ? parseInt(url.port, 10) : 3306,
        database: url.pathname.replace(/^\//, ""),
        user: decodeURIComponent(url.username),
        password: decodeURIComponent(url.password),
        connectionLimit: 2
      })
    })
  });
}

function connectionString() {
  if (process.env.MESSAGING_CONNECTION_STRING) return process.env.MESSAGING_CONNECTION_STRING;
  const envFile = path.resolve(__dirname, "../../../../../.env");
  const match = fs.readFileSync(envFile, "utf8").match(/^MESSAGING_CONNECTION_STRING=(.*)$/m);
  if (!match) throw new Error("MESSAGING_CONNECTION_STRING not found in Api/.env");
  return match[1].trim();
}
