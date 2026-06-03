import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("lists")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("createdByPersonId", sql`char(11)`)
    .addColumn("name", sql`varchar(255)`)
    .addColumn("category", sql`varchar(255)`)
    .addColumn("conditions", sql`mediumtext`)
    .addColumn("dateCreated", sql`datetime`)
    .addColumn("dateModified", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_lists_churchId").on("lists").columns(["churchId"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("lists").ifExists().execute();
}
