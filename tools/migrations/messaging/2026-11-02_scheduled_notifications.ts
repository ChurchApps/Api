import { type Kysely, sql } from "kysely";

// Push notifications queued for a later send time (ChurchAppsSupport#1411), dispatched by the one-minute timer.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.createTable("scheduledNotifications")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("audience", sql`varchar(12)`, (col) => col.notNull())
    .addColumn("groupId", sql`char(11)`)
    .addColumn("title", sql`varchar(80)`, (col) => col.notNull())
    .addColumn("message", sql`varchar(240)`, (col) => col.notNull())
    .addColumn("link", sql`varchar(500)`)
    .addColumn("imageUrl", sql`varchar(500)`)
    .addColumn("sendAt", sql`datetime`, (col) => col.notNull())
    .addColumn("timeZone", sql`varchar(64)`)
    .addColumn("status", sql`varchar(12)`, (col) => col.notNull().defaultTo("pending"))
    .addColumn("claimedAt", sql`datetime`)
    .addColumn("attemptCount", sql`int`, (col) => col.notNull().defaultTo(0))
    .addColumn("sentAt", sql`datetime`)
    .addColumn("recipientCount", sql`int`)
    .addColumn("successCount", sql`int`)
    .addColumn("lastError", sql`varchar(500)`)
    .addColumn("createdByPersonId", sql`char(11)`)
    .addColumn("dateCreated", sql`datetime`, (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
    .addColumn("dateModified", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();
  await db.schema.createIndex("ix_sched_due").on("scheduledNotifications").columns(["status", "sendAt"]).execute();
  await db.schema.createIndex("ix_sched_church").on("scheduledNotifications").columns(["churchId", "status", "sendAt"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("scheduledNotifications").ifExists().execute();
}
