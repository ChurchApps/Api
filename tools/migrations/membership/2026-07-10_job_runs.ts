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
  await db.schema
    .createTable("jobRuns")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("jobName", sql`varchar(50)`, (col) => col.notNull())
    .addColumn("status", sql`varchar(10)`, (col) => col.notNull())
    .addColumn("startedAt", sql`datetime`, (col) => col.notNull())
    .addColumn("durationMs", sql`int`)
    .addColumn("errorMessage", sql`text`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  if (!(await indexExists(db, "jobRuns", "ix_jobRuns_name_started"))) {
    await db.schema.createIndex("ix_jobRuns_name_started").on("jobRuns").columns(["jobName", "startedAt"]).execute();
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("jobRuns").ifExists().execute();
}
