import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("sites")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("name", sql`varchar(255)`)
    .addColumn("subDomain", sql`varchar(45)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_sites_churchId").on("sites").columns(["churchId"]).execute();
  await db.schema.createIndex("idx_sites_subDomain").on("sites").columns(["subDomain"]).unique().execute();

  await db.schema.alterTable("domains").addColumn("siteId", sql`char(11)`, (col) => col.notNull().defaultTo("")).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("domains").dropColumn("siteId").execute();
  await db.schema.dropTable("sites").ifExists().execute();
}
