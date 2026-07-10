import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("storageProviders")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("provider", sql`varchar(45)`)
    .addColumn("apiKey", sql`varchar(255)`)
    .addColumn("apiSecret", sql`varchar(255)`)
    .addColumn("enabled", sql`bit(1)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_storageProviders_churchId").on("storageProviders").columns(["churchId"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("storageProviders").ifExists().execute();
}
