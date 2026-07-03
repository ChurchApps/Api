import { type Kysely, sql } from "kysely";

// Emoji reactions on chat messages: one row per (message, person, emoji); the
// toggle endpoint deletes an existing row or inserts a new one.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("messageReactions")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("messageId", sql`char(11)`)
    .addColumn("conversationId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("emoji", sql`varchar(16)`)
    .addColumn("timeAdded", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`)
    .execute();
  await db.schema.createIndex("idx_messageReactions_unique").on("messageReactions").columns(["messageId", "personId", "emoji"]).unique().execute();
  await db.schema.createIndex("idx_messageReactions_churchId_messageId").on("messageReactions").columns(["churchId", "messageId"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("messageReactions").ifExists().execute();
}
