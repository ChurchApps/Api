import { type Kysely, sql } from "kysely";

// Auto-scheduling parity (roadmap 2.14/2.15): per-volunteer scheduling
// preferences, undo-able autofill runs, and plan-level prepared (penciled-in)
// and auto-replace-on-decline flags.
// schedulingPreferences.personId references membership.people.id (no cross-DB FK).

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("schedulingPreferences")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`)
    .addColumn("personId", sql`char(11)`)
    .addColumn("maxPerMonth", sql`int`)
    .addColumn("preferredTimes", sql`varchar(255)`)
    .addColumn("householdScheduling", sql`varchar(10)`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();
  await db.schema.createIndex("idx_schedulingPreferences_churchId_personId").on("schedulingPreferences").columns(["churchId", "personId"]).execute();

  await db.schema.alterTable("assignments").addColumn("autofillRunId", sql`char(11)`).execute();
  await db.schema.createIndex("idx_assignments_autofillRunId").on("assignments").columns(["autofillRunId"]).execute();

  await db.schema.alterTable("plans").addColumn("prepared", sql`bit(1)`).execute();
  await db.schema.alterTable("plans").addColumn("autoReplaceOnDecline", sql`bit(1)`).execute();
  await db.schema.alterTable("plans").addColumn("lastAutofillRunId", sql`char(11)`).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("plans").dropColumn("lastAutofillRunId").execute();
  await db.schema.alterTable("plans").dropColumn("autoReplaceOnDecline").execute();
  await db.schema.alterTable("plans").dropColumn("prepared").execute();
  await db.schema.dropIndex("idx_assignments_autofillRunId").on("assignments").ifExists().execute();
  await db.schema.alterTable("assignments").dropColumn("autofillRunId").execute();
  await db.schema.dropIndex("idx_schedulingPreferences_churchId_personId").on("schedulingPreferences").ifExists().execute();
  await db.schema.dropTable("schedulingPreferences").ifExists().execute();
}
