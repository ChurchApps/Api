import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("webhooks")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("name", sql`varchar(100)`)
    .addColumn("url", sql`varchar(500)`, (col) => col.notNull())
    .addColumn("secret", sql`varchar(64)`, (col) => col.notNull())
    .addColumn("events", sql`text`, (col) => col.notNull())
    .addColumn("active", sql`tinyint(1)`, (col) => col.notNull().defaultTo(1))
    .addColumn("consecutiveFailures", sql`int`, (col) => col.notNull().defaultTo(0))
    .addColumn("createdBy", sql`char(11)`)
    .addColumn("dateCreated", sql`datetime`, (col) => col.notNull())
    .addColumn("dateModified", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema
    .createTable("webhookDeliveries")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("webhookId", sql`char(11)`, (col) => col.notNull())
    .addColumn("event", sql`varchar(50)`, (col) => col.notNull())
    .addColumn("payload", sql`mediumtext`, (col) => col.notNull())
    .addColumn("status", sql`varchar(20)`, (col) => col.notNull())
    .addColumn("attemptCount", sql`int`, (col) => col.notNull().defaultTo(0))
    .addColumn("responseStatus", sql`int`)
    .addColumn("responseBody", sql`text`)
    .addColumn("nextAttemptAt", sql`datetime`)
    .addColumn("dateCreated", sql`datetime`, (col) => col.notNull())
    .addColumn("dateCompleted", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();

  await db.schema.createIndex("idx_webhooks_churchId").on("webhooks").columns(["churchId"]).execute();
  await db.schema.createIndex("idx_webhookDeliveries_churchId_dateCreated").on("webhookDeliveries").columns(["churchId", "dateCreated"]).execute();
  await db.schema.createIndex("idx_webhookDeliveries_webhookId_dateCreated").on("webhookDeliveries").columns(["webhookId", "dateCreated"]).execute();
  await db.schema.createIndex("idx_webhookDeliveries_status_nextAttemptAt").on("webhookDeliveries").columns(["status", "nextAttemptAt"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("webhookDeliveries").ifExists().execute();
  await db.schema.dropTable("webhooks").ifExists().execute();
}
