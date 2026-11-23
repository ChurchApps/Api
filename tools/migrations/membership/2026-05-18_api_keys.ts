import { type Kysely, sql } from "kysely";

// oAuthTokens.scopes was VARCHAR(45) — too narrow for enforced resource:action scopes; widened to 500.

// Index creation is guarded so the migration can be replayed where the table already
// exists (demo's migration history is reset nightly, so Server Admin runs replay it).
async function indexExists(db: Kysely<any>, table: string, name: string): Promise<boolean> {
  const result = await sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND INDEX_NAME = ${name}
  `.execute(db);
  return Number((result.rows[0] as any)?.count ?? 0) > 0;
}

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("apiKeys")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("personId", sql`char(11)`, (col) => col.notNull())
    .addColumn("userId", sql`char(11)`, (col) => col.notNull())
    .addColumn("name", sql`varchar(100)`)
    .addColumn("hashedKey", sql`varchar(64)`, (col) => col.notNull())
    .addColumn("prefix", sql`varchar(16)`, (col) => col.notNull())
    .addColumn("scopes", sql`text`)
    .addColumn("lastUsedAt", sql`datetime`)
    .addColumn("expiresAt", sql`datetime`)
    .addColumn("createdAt", sql`datetime`, (col) => col.notNull())
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  if (!(await indexExists(db, "apiKeys", "idx_apiKeys_prefix"))) await db.schema.createIndex("idx_apiKeys_prefix").unique().on("apiKeys").columns(["prefix"]).execute();
  if (!(await indexExists(db, "apiKeys", "idx_apiKeys_churchId"))) await db.schema.createIndex("idx_apiKeys_churchId").on("apiKeys").columns(["churchId"]).execute();

  await sql`ALTER TABLE oAuthTokens MODIFY COLUMN scopes VARCHAR(500)`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE oAuthTokens MODIFY COLUMN scopes VARCHAR(45)`.execute(db);
  await db.schema.dropTable("apiKeys").ifExists().execute();
}
