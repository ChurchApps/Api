import { type Kysely, sql } from "kysely";

// Auto-scheduling parity (roadmap 2.14/2.15): per-volunteer scheduling
// preferences, undo-able autofill runs, and plan-level prepared (penciled-in)
// and auto-replace-on-decline flags.
// schedulingPreferences.personId references membership.people.id (no cross-DB FK).
// Execution history for the rule engine: one row per trigger firing (event, schedule
// or run-now). pending rows are retried with backoff by the scheduled-tasks timer.

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

  await db.schema
    .createTable("automationExecutions")
    .ifNotExists()
    .addColumn("id", sql`char(11)`, (col) => col.notNull().primaryKey())
    .addColumn("churchId", sql`char(11)`, (col) => col.notNull())
    .addColumn("triggerId", sql`char(11)`, (col) => col.notNull())
    .addColumn("workflowId", sql`char(11)`)
    .addColumn("subjectType", sql`varchar(45)`)
    .addColumn("subjectId", sql`char(11)`)
    .addColumn("subjectLabel", sql`varchar(255)`)
    .addColumn("eventType", sql`varchar(50)`)
    .addColumn("status", sql`varchar(20)`, (col) => col.notNull())
    .addColumn("attemptCount", sql`int`, (col) => col.defaultTo(0))
    .addColumn("nextAttemptAt", sql`datetime`)
    .addColumn("lastError", sql`text`)
    .addColumn("dateCreated", sql`datetime`, (col) => col.notNull())
    .addColumn("dateCompleted", sql`datetime`)
    .modifyEnd(sql`ENGINE=InnoDB`)
    .execute();
  await db.schema.createIndex("idx_automationExecutions_churchId_triggerId_dateCreated").on("automationExecutions").columns(["churchId", "triggerId", "dateCreated"]).execute();
  await db.schema.createIndex("idx_automationExecutions_status_nextAttemptAt").on("automationExecutions").columns(["status", "nextAttemptAt"]).execute();
  await db.schema.createIndex("idx_automationExecutions_churchId_workflowId_dateCreated").on("automationExecutions").columns(["churchId", "workflowId", "dateCreated"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_automationExecutions_churchId_workflowId_dateCreated").on("automationExecutions").ifExists().execute();
  await db.schema.dropIndex("idx_automationExecutions_status_nextAttemptAt").on("automationExecutions").ifExists().execute();
  await db.schema.dropIndex("idx_automationExecutions_churchId_triggerId_dateCreated").on("automationExecutions").ifExists().execute();
  await db.schema.dropTable("automationExecutions").ifExists().execute();
  await db.schema.alterTable("plans").dropColumn("lastAutofillRunId").execute();
  await db.schema.alterTable("plans").dropColumn("autoReplaceOnDecline").execute();
  await db.schema.alterTable("plans").dropColumn("prepared").execute();
  await db.schema.dropIndex("idx_assignments_autofillRunId").on("assignments").ifExists().execute();
  await db.schema.alterTable("assignments").dropColumn("autofillRunId").execute();
  await db.schema.dropIndex("idx_schedulingPreferences_churchId_personId").on("schedulingPreferences").ifExists().execute();
  await db.schema.dropTable("schedulingPreferences").ifExists().execute();
}
