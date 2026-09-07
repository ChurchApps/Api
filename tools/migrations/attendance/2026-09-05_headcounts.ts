import { type Kysely, sql } from "kysely";

// Manually entered attendance totals ("about 120 people were in the room"), a sibling to
// sessions/visits for churches that count heads instead of checking individuals in.
// serviceId/campusId are denormalized next to serviceTimeId (same shape as visits) so
// trend queries can filter without joining through the service tree.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("headcounts")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("campusId", sql`char(11)`)
    .addColumn("serviceId", sql`char(11)`)
    .addColumn("serviceTimeId", sql`char(11)`)
    .addColumn("groupId", sql`char(11)`)
    .addColumn("headcountDate", sql`datetime`)
    .addColumn("value", sql`int`)
    .addColumn("enteredBy", sql`char(11)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_headcounts_churchId").on("headcounts").column("churchId").execute();
  await db.schema.createIndex("idx_headcounts_church_date").on("headcounts").columns(["churchId", "headcountDate"]).execute();
  await db.schema.createIndex("idx_headcounts_serviceTimeId").on("headcounts").column("serviceTimeId").execute();
  await db.schema.createIndex("idx_headcounts_groupId").on("headcounts").column("groupId").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("headcounts").ifExists().execute();
}
