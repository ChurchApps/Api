import { type Kysely, sql } from "kysely";

// oAuthTokens.scopes was VARCHAR(45) — too narrow for enforced resource:action scopes; widened to 500.

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

  await db.schema.createIndex("idx_apiKeys_prefix").unique().on("apiKeys").columns(["prefix"]).execute();
  await db.schema.createIndex("idx_apiKeys_churchId").on("apiKeys").columns(["churchId"]).execute();

  await sql`ALTER TABLE oAuthTokens MODIFY COLUMN scopes VARCHAR(500)`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE oAuthTokens MODIFY COLUMN scopes VARCHAR(45)`.execute(db);
  await db.schema.dropTable("apiKeys").ifExists().execute();
}
