import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("times")
    .addColumn("serviceTimeType", sql`varchar(20)`, (col) => col.notNull().defaultTo("service"))
    .execute();

  await db.schema
    .createTable("planItemTimes")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("planItemId", sql`char(11)`)
    .addColumn("timeId", sql`char(11)`)
    .addColumn("excluded", sql`tinyint(1)`, (col) => col.notNull().defaultTo(0))
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_planItemTimes_churchId_planItemId").on("planItemTimes").columns(["churchId", "planItemId"]).execute();
  await db.schema.createIndex("idx_planItemTimes_timeId").on("planItemTimes").columns(["timeId"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("planItemTimes").ifExists().execute();
  await db.schema.alterTable("times").dropColumn("serviceTimeType").execute();
}
