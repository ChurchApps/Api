import { type Kysely, sql } from "kysely";

// Read/written whole; no child tables needed.

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("planTemplates")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("ministryId", sql`char(11)`)
    .addColumn("name", sql`varchar(100)`)
    .addColumn("data", sql`mediumtext`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_planTemplates_churchId_ministryId").on("planTemplates").columns(["churchId", "ministryId"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("planTemplates").ifExists().execute();
}
