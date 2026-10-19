import fs from "fs";
import path from "path";
import { Kysely, MysqlDialect, sql } from "kysely";
import { createPool } from "mysql2";

// Deploy Prod failed on 2026-10-18 with "Duplicate column name 'notesViewRole'": prod already had
// the columns but kysely_migration had no row for the migration, so every retry re-ran the ALTER.
// Runs against the slot's content database, whose events table already carries both columns.
import { up } from "../../../../tools/migrations/content/2026-10-17_event_notes_roles";

const db = buildDb();

describe("content/2026-10-17_event_notes_roles", () => {
  afterAll(async () => {
    await db.destroy();
  });

  it("is a no-op when the columns already exist", async () => {
    await expect(up(db as Kysely<any>)).resolves.toBeUndefined();
    const result = await sql<{ COLUMN_NAME: string }>`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'events' AND COLUMN_NAME IN ('notesViewRole', 'notesPostRole')
    `.execute(db);
    expect(result.rows.map((r) => r.COLUMN_NAME).sort()).toEqual(["notesPostRole", "notesViewRole"]);
  });

  it("can run twice in a row", async () => {
    await up(db as Kysely<any>);
    await expect(up(db as Kysely<any>)).resolves.toBeUndefined();
  });
});

function buildDb(): Kysely<never> {
  const url = new URL(contentConnectionString());
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

function contentConnectionString() {
  if (process.env.CONTENT_CONNECTION_STRING) return process.env.CONTENT_CONNECTION_STRING;
  const envFile = path.resolve(__dirname, "../../../../.env");
  const match = fs.readFileSync(envFile, "utf8").match(/^CONTENT_CONNECTION_STRING=(.*)$/m);
  if (!match) throw new Error("CONTENT_CONNECTION_STRING not found in Api/.env");
  return match[1].trim();
}
