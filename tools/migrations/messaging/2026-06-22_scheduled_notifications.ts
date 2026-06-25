import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("scheduledNotifications")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("groupId", sql`char(11)`, (col) => col.notNull())
    .addColumn("title", sql`varchar(100)`)
    .addColumn("message", sql`text`)
    .addColumn("link", sql`varchar(255)`)
    .addColumn("imageUrl", sql`varchar(500)`)
    .addColumn("senderPersonId", sql`char(11)`)
    .addColumn("scheduledTime", sql`datetime`)
    .addColumn("status", sql`varchar(20)`, (col) => col.defaultTo("pending"))
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();

  await db.schema.createIndex("idx_scheduledNotifications_status_scheduledTime").on("scheduledNotifications").columns(["status", "scheduledTime"]).execute();
  await db.schema.createIndex("idx_scheduledNotifications_churchId_groupId").on("scheduledNotifications").columns(["churchId", "groupId"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("scheduledNotifications").ifExists().execute();
}
