import { type Kysely, sql } from "kysely";

// reminderOffsets: CSV of days-before-service to remind (0 = day-of, empty = off).
// remindersSent: CSV of offsets already fired per plan, for idempotency on re-run.

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("planTypes").addColumn("reminderOffsets", sql`varchar(255)`, (col) => col.defaultTo("2")).execute();
  await db.schema.alterTable("planTypes").addColumn("reminderMessage", sql`text`).execute();
  await db.schema.alterTable("plans").addColumn("remindersSent", sql`varchar(255)`).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("plans").dropColumn("remindersSent").execute();
  await db.schema.alterTable("planTypes").dropColumn("reminderMessage").execute();
  await db.schema.alterTable("planTypes").dropColumn("reminderOffsets").execute();
}
