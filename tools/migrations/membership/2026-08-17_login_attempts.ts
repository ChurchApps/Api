import { type Kysely, sql } from "kysely";

async function indexExists(db: Kysely<any>, table: string, index: string): Promise<boolean> {
  const result = await sql<{ count: number }>`
    SELECT COUNT(*) as count
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ${table} AND INDEX_NAME = ${index}
  `.execute(db);
  return Number((result.rows[0] as any)?.count ?? 0) > 0;
}

export async function up(db: Kysely<any>): Promise<void> {
  // Failed-login counters. Shared state is required because the API runs on Lambda,
  // where each concurrent container has its own memory and containers recycle constantly.
  await db.schema
    .createTable("loginAttempts")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("attemptKey", sql`varchar(191)`, (col) => col.notNull().unique())
    .addColumn("attemptCount", sql`int`, (col) => col.notNull().defaultTo(0))
    .addColumn("windowStart", sql`datetime`, (col) => col.notNull())
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  if (!(await indexExists(db, "loginAttempts", "ix_loginAttempts_windowStart"))) {
    await db.schema.createIndex("ix_loginAttempts_windowStart").on("loginAttempts").columns(["windowStart"]).execute();
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("loginAttempts").ifExists().execute();
}
