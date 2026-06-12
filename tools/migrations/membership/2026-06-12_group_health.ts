import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("groups").addColumn("attendanceReminders", sql`bit(1)`).execute();

  await db.schema
    .createTable("groupMemberHistory")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("groupId", sql`char(11)`, (col) => col.notNull())
    .addColumn("personId", sql`char(11)`, (col) => col.notNull())
    .addColumn("action", sql`varchar(10)`, (col) => col.notNull())
    .addColumn("actionDate", sql`datetime`, (col) => col.notNull())
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_groupMemberHistory_churchId_groupId_actionDate").on("groupMemberHistory").columns(["churchId", "groupId", "actionDate"]).execute();
  await db.schema.createIndex("idx_groupMemberHistory_churchId_actionDate").on("groupMemberHistory").columns(["churchId", "actionDate"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("groupMemberHistory").ifExists().execute();
  await db.schema.alterTable("groups").dropColumn("attendanceReminders").execute();
}
