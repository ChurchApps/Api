import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("groups")
    .addColumn("joinPolicy", sql`varchar(20)`, (col) => col.notNull().defaultTo("open"))
    .execute();

  await db.schema
    .createTable("groupJoinRequests")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("groupId", sql`char(11)`, (col) => col.notNull())
    .addColumn("personId", sql`char(11)`, (col) => col.notNull())
    .addColumn("message", sql`varchar(1000)`)
    .addColumn("requestDate", sql`datetime`, (col) => col.notNull())
    .addColumn("status", sql`varchar(20)`, (col) => col.notNull())
    .addColumn("decidedBy", sql`char(11)`)
    .addColumn("decidedDate", sql`datetime`)
    .addColumn("declineReason", sql`varchar(500)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_groupJoinRequests_churchId_status").on("groupJoinRequests").columns(["churchId", "status"]).execute();
  await db.schema.createIndex("idx_groupJoinRequests_churchId_groupId_status").on("groupJoinRequests").columns(["churchId", "groupId", "status"]).execute();
  await db.schema.createIndex("idx_groupJoinRequests_churchId_personId_status").on("groupJoinRequests").columns(["churchId", "personId", "status"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("groupJoinRequests").ifExists().execute();
  await db.schema.alterTable("groups").dropColumn("joinPolicy").execute();
}
