import { type Kysely, sql } from "kysely";

// Idempotency moved to reminderSentLog; deploy after ServingReminderHelper lands.

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("plans").dropColumn("remindersSent").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("plans").addColumn("remindersSent", sql`varchar(255)`).execute();
}
